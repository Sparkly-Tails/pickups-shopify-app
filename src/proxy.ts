import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  verifyShopifyHmac,
  makeSessionToken,
  verifyUrlToken,
} from '@/lib/shopify-auth'

// No cookie anywhere in this file, deliberately. Earlier versions used a
// Partitioned/CHIPS session cookie, which works on Chrome and the iPhone
// Shopify app but never persists at all in the Shopify mobile app's
// webview on iPad — no cookie attribute combination fixed that. Shopify
// App Bridge session tokens were tried as a cookie-free alternative and
// ruled out too (handshake never completes on iPad, even after a 20s wait
// and the meta tag Shopify's docs require, with zero errors either way).
// The `stt` URL/header token below is the one mechanism that doesn't
// depend on anything surviving between requests at all, so it's the only
// one left.

// Mints a fresh auth token and attaches it two ways: as a request header
// (so Server Components can read it via headers() and bake it into
// AuthLink hrefs for this render) and as a response header (so the
// client's fetch patch — see AuthTokenInit.tsx — can pick it up and keep
// its own copy fresh for future same-origin fetches and router
// navigations). This is the only place either header gets set, so every
// successful auth path — cookie, HMAC, or URL token — funnels through it.
async function nextWithFreshToken(req: NextRequest, shop: string, secret: string): Promise<NextResponse> {
  const freshToken = await makeSessionToken(shop, secret)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-auth-token', freshToken)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('x-auth-token', freshToken)
  return res
}

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
  const shop = process.env.SHOPIFY_SHOP

  console.log('[proxy] page route', pathname, {
    hasHmac: searchParams.has('hmac'),
    hasShop: searchParams.has('shop'),
    secretSet: !!secret,
    apiKeySet: !!apiKey,
    hasUrlToken: !!searchParams.get('stt'),
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

  if (!shop) {
    console.error('[proxy] SHOPIFY_SHOP not set')
    return new NextResponse('App misconfigured: SHOPIFY_SHOP missing (503)', {
      status: 503,
    })
  }

  // Shopify-signed URL (install or embedded load)
  if (searchParams.has('hmac') && searchParams.has('shop')) {
    const valid = await verifyShopifyHmac(searchParams, secret)
    console.log('[proxy] HMAC valid:', valid, 'hasHost:', searchParams.has('host'))
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
      console.log('[proxy] embedded load, HMAC valid → render')
      return nextWithFreshToken(req, shop, secret)
    }

    // No `host` → Partners install URL → always run OAuth.
    const startUrl = new URL('/api/auth/start', req.url)
    searchParams.forEach((v, k) => startUrl.searchParams.set(k, v))
    return NextResponse.redirect(startUrl)
  }

  // Subsequent requests (full page loads AND RSC navigation fetches alike —
  // Proxy cannot and must not distinguish them: as of Next.js 16, Proxy
  // deliberately strips RSC signal headers so it can't tell RSC requests
  // apart from full page loads). Stateless URL/header token — see the
  // module-level comment above for why this is the only mechanism left.
  // Carried as a `stt` query param on every same-origin fetch (see
  // AuthTokenInit.tsx) and baked into every AuthLink href server-side via
  // the `x-auth-token` request header this function sets. Also how
  // /api/auth/session hands off a session to staff who can't run OAuth —
  // it redirects to `/?stt=<token>`, landing right here.
  const urlToken = searchParams.get('stt')
  if (urlToken && (await verifyUrlToken(urlToken, secret))) {
    return nextWithFreshToken(req, shop, secret)
  }

  // No valid session — show a message directing staff to open from Shopify admin
  return new NextResponse(
    `<!DOCTYPE html><html><head><title>Access restricted</title></head><body style="font-family:sans-serif;padding:40px;text-align:center">
      <h2>Open this app from your Shopify admin</h2>
      <p>This app can only be accessed via the Shopify admin.</p>
      <p><a href="https://${shop}/admin/apps">Go to Shopify admin &rarr;</a></p>
    </body></html>`,
    { status: 403, headers: { 'Content-Type': 'text/html' } },
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
