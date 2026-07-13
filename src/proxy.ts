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
    const valid = await verifyShopifyHmac(searchParams, secret)
    console.log('[proxy] HMAC valid:', valid, 'hasHost:', searchParams.has('host'),
      'hasCookie:', !!req.cookies.get('__shopify_session'))
    if (!valid) {
      return new NextResponse(
        `HMAC verification failed.\nSHOPIFY_API_SECRET_KEY length: ${secret.length}`,
        { status: 403 },
      )
    }

    // Fast-path: embedded load from Shopify admin (has `host` param) with a
    // valid session cookie → render directly. Partners install URLs do NOT
    // include `host`, so this never fires during a fresh install, which
    // always falls through to auth/start → OAuth below.
    if (searchParams.has('host')) {
      const cookie = req.cookies.get('__shopify_session')?.value
      if (cookie && (await verifySessionToken(cookie, secret))) {
        console.log('[proxy] embedded load fast-path → render')
        return NextResponse.next()
      }
      // Embedded load but no session (e.g. staff with limited permissions who
      // can't run OAuth). Hand off to auth/session which issues a cookie if
      // the app is already installed, or falls back to OAuth if not.
      const sessionUrl = new URL('/api/auth/session', req.url)
      searchParams.forEach((v, k) => sessionUrl.searchParams.set(k, v))
      return NextResponse.redirect(sessionUrl)
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

  // Session token passed in URL (auth/session broke out of Shopify iframe via
  // window.top.location.href to land at top-level, bypassing third-party cookie
  // blocking). Set the cookie, then redirect back into the Shopify admin so the
  // app re-embeds properly — NOT to '/' which would open standalone.
  const sessionParam = searchParams.get('session')
  if (sessionParam && (await verifySessionToken(sessionParam, secret))) {
    console.log('[proxy] URL session token valid — issuing cookie, redirecting to Shopify admin')
    const shop = process.env.SHOPIFY_SHOP
    const target = shop && apiKey
      ? `https://${shop}/admin/apps/${apiKey}`
      : new URL('/', req.url).href
    const res = NextResponse.redirect(target)
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
