import { NextRequest, NextResponse } from 'next/server'
import {
  verifyShopifyHmac,
  makeSessionToken,
  verifySessionToken,
} from '@/lib/shopify-auth'

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  // Pass through static assets and API routes (API routes use PICKUP_APP_SECRET)
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // Skip auth in local development so the app remains usable without a
  // real Shopify HMAC handshake during development.
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next()
  }

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  if (!secret) {
    return new NextResponse('App misconfigured: SHOPIFY_API_SECRET_KEY missing', {
      status: 503,
    })
  }

  // ── Shopify is loading the app with a signed URL ──────────────────────────
  if (searchParams.has('hmac') && searchParams.has('shop')) {
    const valid = await verifyShopifyHmac(searchParams, secret)
    if (!valid) {
      return new NextResponse('Invalid HMAC', { status: 403 })
    }
    const shop = searchParams.get('shop')!
    const token = await makeSessionToken(shop, secret)
    const res = NextResponse.next()
    res.cookies.set('__shopify_session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none', // required for cross-origin iframe cookies
      maxAge: 8 * 60 * 60,
      path: '/',
    })
    return res
  }

  // ── Subsequent requests — verify session cookie ───────────────────────────
  const cookie = req.cookies.get('__shopify_session')?.value
  if (cookie && (await verifySessionToken(cookie, secret))) {
    return NextResponse.next()
  }

  // ── No valid session — send to Shopify admin ─────────────────────────────
  const shop = process.env.SHOPIFY_SHOP
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY
  if (shop && apiKey) {
    return NextResponse.redirect(
      `https://${shop}/admin/apps/${apiKey}`,
    )
  }
  return new NextResponse('Unauthorized', { status: 403 })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
