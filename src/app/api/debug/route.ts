import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
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
