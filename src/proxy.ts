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

  // API routes: Bearer token auth
  if (pathname.startsWith('/api/')) {
    if (pathname.startsWith('/api/webhooks')) {
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
  if (!secret) {
    return new NextResponse('App misconfigured: SHOPIFY_API_SECRET_KEY missing', {
      status: 503,
    })
  }

  // Shopify-signed URL (app load from admin)
  if (searchParams.has('hmac') && searchParams.has('shop')) {
    const valid = await verifyShopifyHmac(searchParams, secret)
    if (!valid) {
      return new NextResponse('Invalid HMAC', { status: 403 })
    }
    const shop = searchParams.get('shop')!
    const token = await makeSessionToken(shop, secret)

    // If a valid session cookie is already present this is the iframe reload
    // (Shopify admin embedding the app after the redirect below). Render normally.
    const existing = req.cookies.get('__shopify_session')?.value
    const isEmbeddedReload = existing && (await verifySessionToken(existing, secret))

    if (isEmbeddedReload) {
      const res = NextResponse.next()
      res.cookies.set('__shopify_session', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 8 * 60 * 60,
        path: '/',
      })
      return res
    }

    // First load in a standalone browser tab — set cookie then redirect to
    // Shopify admin, which will embed the app in an iframe.
    const shopSlug = shop.replace('.myshopify.com', '')
    const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY
    const adminUrl = `https://admin.shopify.com/store/${shopSlug}/apps/${apiKey}`
    const res = NextResponse.redirect(adminUrl)
    res.cookies.set('__shopify_session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 8 * 60 * 60,
      path: '/',
    })
    return res
  }

  // Subsequent requests — check session cookie
  const cookie = req.cookies.get('__shopify_session')?.value
  if (cookie && (await verifySessionToken(cookie, secret))) {
    return NextResponse.next()
  }

  // No valid session — redirect to Shopify admin
  const shop = process.env.SHOPIFY_SHOP
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY
  if (shop && apiKey) {
    return NextResponse.redirect(`https://${shop}/admin/apps/${apiKey}`)
  }
  return new NextResponse('Unauthorized', { status: 403 })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
