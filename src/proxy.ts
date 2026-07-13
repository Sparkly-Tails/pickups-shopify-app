import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  verifyShopifyHmac,
  makeSessionToken,
  verifySessionToken,
} from '@/lib/shopify-auth'

export async function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  // Static assets: always pass through
  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico') {
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
      // Also attempt to set a cookie; it persists if the browser allows
      // SameSite=None in the cross-site iframe, giving a fast-path next time.
      console.log('[proxy] embedded load, no session → render + attempt cookie')
      const sessionToken = await makeSessionToken(shop, secret)
      const res = NextResponse.next()
      res.cookies.set('__shopify_session', sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
      })
      return res
    }

    // No `host` → Partners install URL → always run OAuth.
    const startUrl = new URL('/api/auth/start', req.url)
    searchParams.forEach((v, k) => startUrl.searchParams.set(k, v))
    return NextResponse.redirect(startUrl)
  }

  // Subsequent requests — check session cookie
  const cookie = req.cookies.get('__shopify_session')?.value
  if (cookie && (await verifySessionToken(cookie, secret))) {
    return NextResponse.next()
  }

  // RSC navigation from within the embedded app: Next.js client-side routing
  // fetches with ?_rsc= and Accept: text/x-component. Browsers may block
  // SameSite=None cookies in cross-site iframes (Referer is also unreliable
  // in that context), so we identify RSC requests by their headers instead.
  const isRscRequest =
    searchParams.has('_rsc') &&
    (req.headers.get('accept')?.includes('text/x-component') ?? false)
  if (isRscRequest) {
    console.log('[proxy] RSC navigation, allowing through')
    return NextResponse.next()
  }

  // Session token passed in URL — stays within the iframe (same-origin redirect).
  // Shopify admin does not intercept same-origin navigations, so no new window.
  const sessionParam = searchParams.get('session')
  if (sessionParam && (await verifySessionToken(sessionParam, secret))) {
    console.log('[proxy] URL session token valid — issuing cookie, redirecting to /')
    const cleanUrl = new URL('/', req.url)
    const res = NextResponse.redirect(cleanUrl)
    res.cookies.set('__shopify_session', sessionParam, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })
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
