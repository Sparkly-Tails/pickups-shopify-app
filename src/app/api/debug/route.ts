import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const callbackUrl = new URL('/api/auth/callback', req.url).toString()
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || ''
  const shop = process.env.SHOPIFY_SHOP || ''

  // Build exactly the same OAuth URL that /api/auth/start would build,
  // so you can see the exact redirect_uri being sent to Shopify
  const oauthUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  oauthUrl.searchParams.set('client_id', apiKey)
  oauthUrl.searchParams.set('scope', 'read_customers,read_orders,read_products')
  oauthUrl.searchParams.set('redirect_uri', callbackUrl)

  return NextResponse.json({
    oauth: {
      callbackUrl,
      fullOAuthUrl: oauthUrl.toString(),
      redirectUriEncoded: oauthUrl.searchParams.get('redirect_uri'),
      note: 'Copy callbackUrl exactly (no trailing slash) into Shopify Partners → app → Configuration → Allowed redirection URL(s)',
    },
    env: {
      SHOPIFY_API_SECRET_KEY: process.env.SHOPIFY_API_SECRET_KEY
        ? `set (${process.env.SHOPIFY_API_SECRET_KEY.length} chars)`
        : 'MISSING',
      NEXT_PUBLIC_SHOPIFY_API_KEY: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY
        ? `set (${process.env.NEXT_PUBLIC_SHOPIFY_API_KEY.length} chars)`
        : 'MISSING',
      SHOPIFY_SHOP: process.env.SHOPIFY_SHOP || 'MISSING',
      SHOPIFY_ACCESS_TOKEN: process.env.SHOPIFY_ACCESS_TOKEN
        ? `set (${process.env.SHOPIFY_ACCESS_TOKEN.length} chars)`
        : 'MISSING',
      PICKUP_APP_SECRET: process.env.PICKUP_APP_SECRET
        ? `set (${process.env.PICKUP_APP_SECRET.length} chars)`
        : 'MISSING',
      APP_URL: process.env.APP_URL || 'not set',
      NODE_ENV: process.env.NODE_ENV,
    },
  })
}
