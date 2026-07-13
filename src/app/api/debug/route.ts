import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { ShopifyTokenModel } from '@/models/ShopifyToken'

// POST /api/debug/wipe — delete the stored Shopify token so the next install runs fresh OAuth
export async function POST(req: NextRequest) {
  const secret = process.env.PICKUP_APP_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const shop = process.env.SHOPIFY_SHOP
  if (!shop) return NextResponse.json({ error: 'SHOPIFY_SHOP not set' }, { status: 503 })
  await connectDB()
  const result = await ShopifyTokenModel.deleteOne({ shop })
  return NextResponse.json({ deleted: result.deletedCount, shop })
}

export async function GET(req: NextRequest) {
  const callbackUrl = new URL('/api/auth/callback', req.url).toString()
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || ''
  const shop = process.env.SHOPIFY_SHOP || ''

  const oauthUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  oauthUrl.searchParams.set('client_id', apiKey)
  oauthUrl.searchParams.set('scope', 'read_customers,read_orders,read_products')
  oauthUrl.searchParams.set('redirect_uri', callbackUrl)

  let mongoTokenStatus = 'unknown'
  try {
    await connectDB()
    const record = await ShopifyTokenModel.findOne({ shop }).lean()
    mongoTokenStatus = record ? `token stored (${String((record as { accessToken?: string }).accessToken ?? '').length} chars)` : 'NO TOKEN — fresh install will run OAuth'
  } catch (e) {
    mongoTokenStatus = `MongoDB error: ${String(e)}`
  }

  const hasCookie = !!req.cookies.get('__shopify_session')

  const shopifyAdminRedirectUrl = shop && apiKey
    ? `https://${shop}/admin/apps/${apiKey}`
    : null

  return NextResponse.json({
    oauth: {
      callbackUrl,
      fullOAuthUrl: oauthUrl.toString(),
      redirectUriEncoded: oauthUrl.searchParams.get('redirect_uri'),
      note: 'Copy callbackUrl exactly (no trailing slash) into Shopify Partners → app → Configuration → Allowed redirection URL(s)',
    },
    session: {
      hasCookie,
      note: hasCookie
        ? 'Session cookie is present — embedded loads will fast-path without OAuth'
        : 'No session cookie — next Shopify-signed request will go through OAuth',
    },
    mongodb: {
      shop,
      status: mongoTokenStatus,
      note: 'If token is stored and you need a clean reinstall, clear the __shopify_session cookie in your browser first',
    },
    staffAuth: {
      shopifyAdminRedirectUrl,
      status: shopifyAdminRedirectUrl ? 'OK — proxy will redirect here after issuing staff session cookie' : 'BROKEN — SHOPIFY_SHOP or NEXT_PUBLIC_SHOPIFY_API_KEY missing; staff will land on standalone app instead of Shopify admin',
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
      NODE_ENV: process.env.NODE_ENV,
    },
  })
}
