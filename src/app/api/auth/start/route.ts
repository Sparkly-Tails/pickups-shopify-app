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

  // Shopify includes `host` when loading an embedded app from the admin,
  // but NOT in the install-from-Partners flow. This is the only reliable
  // way to distinguish a fresh install attempt from a normal embedded load.
  const isEmbeddedLoad = searchParams.has('host')

  if (isEmbeddedLoad) {
    // Normal load from Shopify admin — skip OAuth, use the stored token.
    let hasToken = false
    try {
      await connectDB()
      const record = await ShopifyTokenModel.findOne({ shop }).lean()
      hasToken = !!(record && 'accessToken' in record && record.accessToken)
    } catch (e) {
      console.error('[auth/start] MongoDB error (embedded load):', e)
    }

    if (hasToken) {
      // Reuse a valid session cookie or issue a fresh one
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
    // No token even on an embedded load — fall through to OAuth to recover
  }

  // No `host` param = install from Partners (or no token in DB) → OAuth
  const callbackUrl = new URL('/api/auth/callback', req.url).toString()
  const scopes = 'read_customers,read_orders,read_products'

  const oauthUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  oauthUrl.searchParams.set('client_id', apiKey)
  oauthUrl.searchParams.set('scope', scopes)
  oauthUrl.searchParams.set('redirect_uri', callbackUrl)

  console.log('[auth/start] OAuth — shop:', shop, 'isEmbeddedLoad:', isEmbeddedLoad)
  return NextResponse.redirect(oauthUrl.toString())
}
