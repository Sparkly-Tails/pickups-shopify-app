import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  verifyShopifyHmac,
  makeSessionToken,
  verifySessionToken,
} from '@/lib/shopify-auth'

// Cookie options shared by every place we issue the session cookie.
// `partitioned` (CHIPS) is required for the cookie to survive inside the
// cross-site Shopify admin iframe: Chrome treats cookies set during a
// cross-site iframe navigation as third-party and drops them unless they're
// partitioned per top-level site. Without this, RSC client-side navigation
// fetches (same-origin to the app, but issued from a page loaded in a
// third-party iframe) never carry the cookie, no matter what request
// headers or URL params they include. Note: as of Next.js 16, Proxy
// deliberately strips RSC signal headers (`rsc`, `next-router-state-tree`,
// `next-router-prefetch`) from `request.headers` so Proxy can't tell RSC
// requests apart from full page loads — see the "RSC requests and rewrites"
// section of the proxy docs. That makes cookie persistence the only viable
// fix; RSC requests must be authenticated exactly like any other request.
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none' as const,
  partitioned: true,
  maxAge: 30 * 24 * 60 * 60,
  path: '/',
}

export async function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  // Static assets: always pass through
  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico') {
    return NextResponse.next()
  }

  // TEMPORARY: App Bridge diagnostic page must be reachable regardless of
  // session state — that's the point of it. Delete this exemption and the
  // route itself once the session-token investigation is done.
  if (pathname.startsWith('/app-bridge-test')) {
    return NextResponse.next()
  }

  // API routes: Bearer token auth (auth routes and webhooks are exempt)
  if (pathname.startsWith('/api/')) {
    if (
      pathname.startsWith('/api/webhooks') ||
      pathname.startsWith('/api/debug') ||
      pathname.startsWith('/api/auth/')
    ) {
      return NextResponse.next()
    }
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.PICKUP_APP_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
  }

  // Page routes: skip auth in development
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next()
  }

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY

  console.log('[proxy] page route', pathname, {
    hasHmac: searchParams.has('hmac'),
    hasShop: searchParams.has('shop'),
    secretSet: !!secret,
    apiKeySet: !!apiKey,
    hasCookie: !!req.cookies.get('__shopify_session'),
  })

  if (!secret) {
    console.error('[proxy] SHOPIFY_API_SECRET_KEY not set')
    return new NextResponse('App misconfigured: SHOPIFY_API_SECRET_KEY missing (503)', {
      status: 503,
    })
  }

  if (!apiKey) {
    console.error('[proxy] NEXT_PUBLIC_SHOPIFY_API_KEY not set')
    return new NextResponse('App misconfigured: NEXT_PUBLIC_SHOPIFY_API_KEY missing (503)', {
      status: 503,
    })
  }

  // Shopify-signed URL (install or embedded load)
  if (searchParams.has('hmac') && searchParams.has('shop')) {
    const shop = searchParams.get('shop')!
    const valid = await verifyShopifyHmac(searchParams, secret)
    console.log('[proxy] HMAC valid:', valid, 'hasHost:', searchParams.has('host'),
      'hasCookie:', !!req.cookies.get('__shopify_session'))
    if (!valid) {
      return new NextResponse(
        `HMAC verification failed.\nSHOPIFY_API_SECRET_KEY length: ${secret.length}`,
        { status: 403 },
      )
    }

    // Fast-path: embedded load from Shopify admin (has `host` param).
    // Partners install URLs do NOT include `host`, so this never fires during
    // a fresh install, which always falls through to auth/start → OAuth below.
    if (searchParams.has('host')) {
      const cookie = req.cookies.get('__shopify_session')?.value
      if (cookie && (await verifySessionToken(cookie, secret))) {
        console.log('[proxy] embedded load fast-path → render')
        return NextResponse.next()
      }
      // No session cookie — HMAC is valid so allow the page to render.
      // Issue a partitioned cookie so it persists in the iframe and covers
      // every subsequent request, including RSC client-side navigation.
      console.log('[proxy] embedded load, no session → render + set partitioned cookie')
      const sessionToken = await makeSessionToken(shop, secret)
      const res = NextResponse.next()
      res.cookies.set('__shopify_session', sessionToken, SESSION_COOKIE_OPTIONS)
      return res
    }

    // No `host` → Partners install URL → always run OAuth.
    const startUrl = new URL('/api/auth/start', req.url)
    searchParams.forEach((v, k) => startUrl.searchParams.set(k, v))
    return NextResponse.redirect(startUrl)
  }

  // Subsequent requests (full page loads AND RSC navigation fetches alike —
  // Proxy cannot and must not distinguish them, see comment above) — check
  // session cookie.
  const cookie = req.cookies.get('__shopify_session')?.value
  if (cookie && (await verifySessionToken(cookie, secret))) {
    return NextResponse.next()
  }

  // Session token passed in URL — stays within the iframe (same-origin redirect).
  // Shopify admin does not intercept same-origin navigations, so no new window.
  const sessionParam = searchParams.get('session')
  if (sessionParam && (await verifySessionToken(sessionParam, secret))) {
    console.log('[proxy] URL session token valid — issuing cookie, redirecting to /')
    const cleanUrl = new URL('/', req.url)
    const res = NextResponse.redirect(cleanUrl)
    res.cookies.set('__shopify_session', sessionParam, SESSION_COOKIE_OPTIONS)
    return res
  }

  // No valid session — show a message directing staff to open from Shopify admin
  const shop = process.env.SHOPIFY_SHOP
  return new NextResponse(
    `<!DOCTYPE html><html><head><title>Access restricted</title></head><body style="font-family:sans-serif;padding:40px;text-align:center">
      <h2>Open this app from your Shopify admin</h2>
      <p>This app can only be accessed via the Shopify admin.</p>
      ${shop ? `<p><a href="https://${shop}/admin/apps">Go to Shopify admin &rarr;</a></p>` : ''}
    </body></html>`,
    { status: 403, headers: { 'Content-Type': 'text/html' } },
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
