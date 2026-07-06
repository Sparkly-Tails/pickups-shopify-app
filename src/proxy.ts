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

  // Shopify-signed URL (app load from admin)
  if (searchParams.has('hmac') && searchParams.has('shop')) {
    const valid = await verifyShopifyHmac(searchParams, secret)
    console.log('[proxy] HMAC valid:', valid)
    if (!valid) {
      return new NextResponse(
        `HMAC verification failed. Check SHOPIFY_API_SECRET_KEY in Vercel env vars.\nSecret length: ${secret.length}`,
        { status: 403 },
      )
    }
    const shop = searchParams.get('shop')!
    const token = await makeSessionToken(shop, secret)

    // If a valid session cookie is already present this is the iframe reload
    const existing = req.cookies.get('__shopify_session')?.value
    const isEmbeddedReload = existing && (await verifySessionToken(existing, secret))
    console.log('[proxy] isEmbeddedReload:', !!isEmbeddedReload)

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

    // First load — redirect to Shopify admin to trigger iframe embedding
    const shopSlug = shop.replace('.myshopify.com', '')
    const adminUrl = `https://admin.shopify.com/store/${shopSlug}/apps/${apiKey}`
    console.log('[proxy] redirecting to admin:', adminUrl)
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
  if (shop && apiKey) {
    return NextResponse.redirect(`https://${shop}/admin/apps/${apiKey}`)
  }
  return new NextResponse('Unauthorized', { status: 403 })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
