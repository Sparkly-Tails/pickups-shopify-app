import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac, makeSessionToken, verifySessionToken } from '@/lib/shopify-auth'
import { connectDB } from '@/lib/mongodb'
import { ShopifyTokenModel } from '@/models/ShopifyToken'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const shop = searchParams.get('shop')

  if (!shop) return new NextResponse('Missing shop', { status: 400 })

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY

  if (!secret || !apiKey) {
    return new NextResponse('App misconfigured', { status: 503 })
  }

  const valid = await verifyShopifyHmac(searchParams, secret)
  if (!valid) return new NextResponse('Invalid HMAC', { status: 403 })

  // Check MongoDB first — we must confirm the app is installed before
  // trusting any session cookie. A stale cookie from a pre-OAuth test
  // must NOT prevent the first-time OAuth install from happening.
  let isInstalled = false
  try {
    await connectDB()
    const record = await ShopifyTokenModel.findOne({ shop }).lean()
    isInstalled = !!(record && 'accessToken' in record && record.accessToken)
  } catch (e) {
    console.error('[auth/start] MongoDB error:', e)
    // Fall through — treat as not installed (OAuth is safer than silent failure)
  }

  if (!isInstalled) {
    // Build callback URL from the live request so it always matches what
    // Shopify's whitelist expects, regardless of APP_URL env var value.
    const callbackUrl = new URL('/api/auth/callback', req.url).toString()
    const scopes = 'read_customers,read_orders,read_products'

    const oauthUrl = new URL(`https://${shop}/admin/oauth/authorize`)
    oauthUrl.searchParams.set('client_id', apiKey)
    oauthUrl.searchParams.set('scope', scopes)
    oauthUrl.searchParams.set('redirect_uri', callbackUrl)

    console.log('[auth/start] OAuth redirect — shop:', shop, 'callbackUrl:', callbackUrl)
    return NextResponse.redirect(oauthUrl.toString())
  }

  // App is installed — use an existing valid session cookie or issue a new one
  const existingCookie = req.cookies.get('__shopify_session')?.value
  if (existingCookie && (await verifySessionToken(existingCookie, secret))) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  const sessionToken = await makeSessionToken(shop, secret)
  const res = NextResponse.redirect(new URL('/', req.url))
  res.cookies.set('__shopify_session', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 8 * 60 * 60,
    path: '/',
  })
  return res
}
