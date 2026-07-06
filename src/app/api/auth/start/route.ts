import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac } from '@/lib/shopify-auth'

// This route only has one job: redirect to Shopify OAuth.
// All session/token decisions happen elsewhere — proxy (fast-path) and
// callback (token storage + cookie issue).
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
  if (!valid) {
    console.error('[auth/start] HMAC invalid for shop:', shop)
    return new NextResponse('Invalid HMAC', { status: 403 })
  }

  const callbackUrl = new URL('/api/auth/callback', req.url).toString()
  const scopes = 'read_customers,read_orders,read_products'

  const oauthUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  oauthUrl.searchParams.set('client_id', apiKey)
  oauthUrl.searchParams.set('scope', scopes)
  oauthUrl.searchParams.set('redirect_uri', callbackUrl)

  console.log('[auth/start] → OAuth shop:', shop, 'callback:', callbackUrl,
    'params received:', Object.fromEntries(searchParams.entries()))
  return NextResponse.redirect(oauthUrl.toString())
}
