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
    if (pathname.startsWith('/api/webhooks') || pathname.startsWith('/api/debug')) {
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

  // Shopify-signed URL — verify HMAC, set session cookie, render the app
  if (searchParams.has('hmac') && searchParams.has('shop')) {
    const valid = await verifyShopifyHmac(searchParams, secret)
    console.log('[proxy] HMAC valid:', valid, 'secret.length:', secret.length)
    if (!valid) {
      return new NextResponse(
        `HMAC verification failed.\nSHOPIFY_API_SECRET_KEY length: ${secret.length}\nEnsure the key in Vercel matches the API secret key in your Shopify app.`,
        { status: 403 },
      )
    }
    const shop = searchParams.get('shop')!
    const token = await makeSessionToken(shop, secret)
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

  // Subsequent requests — check session cookie
  const cookie = req.cookies.get('__shopify_session')?.value
  if (cookie && (await verifySessionToken(cookie, secret))) {
    return NextResponse.next()
  }

  // No valid session — show a message directing staff to open from Shopify admin
  const shop = process.env.SHOPIFY_SHOP
  return new NextResponse(
    `<!DOCTYPE html><html><head><title>Access restricted</title></head><body style="font-family:sans-serif;padding:40px;text-align:center">
      <h2>Open this app from your Shopify admin</h2>
      <p>This app can only be accessed via the Shopify admin.</p>
      ${shop ? `<p><a href="https://${shop}/admin/apps">Go to Shopify admin →</a></p>` : ''}
    </body></html>`,
    { status: 403, headers: { 'Content-Type': 'text/html' } },
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
