import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac, makeSessionToken } from '@/lib/shopify-auth'
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

  // Check if this shop already has a stored token (already installed)
  try {
    await connectDB()
    const record = await ShopifyTokenModel.findOne({ shop }).lean()
    if (record && 'accessToken' in record && record.accessToken) {
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
  } catch (e) {
    console.error('[auth/start] MongoDB error:', e)
    // Fall through to OAuth — better to re-install than fail silently
  }

  // Not installed yet — redirect to Shopify OAuth
  const appUrl = process.env.APP_URL || `https://${req.headers.get('host')}`
  const callbackUrl = `${appUrl}/api/auth/callback`
  const scopes = 'read_customers,read_orders,read_products'

  const oauthUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  oauthUrl.searchParams.set('client_id', apiKey)
  oauthUrl.searchParams.set('scope', scopes)
  oauthUrl.searchParams.set('redirect_uri', callbackUrl)

  return NextResponse.redirect(oauthUrl.toString())
}
