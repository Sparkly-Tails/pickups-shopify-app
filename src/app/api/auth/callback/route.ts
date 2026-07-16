import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac } from '@/lib/shopify-auth'
import { connectDB } from '@/lib/mongodb'
import { ShopifyTokenModel } from '@/models/ShopifyToken'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const shop = searchParams.get('shop')
  const code = searchParams.get('code')

  if (!shop || !code) {
    return new NextResponse('Missing shop or code', { status: 400 })
  }

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY

  if (!secret || !apiKey) {
    return new NextResponse('App misconfigured', { status: 503 })
  }

  const valid = await verifyShopifyHmac(searchParams, secret)
  if (!valid) return new NextResponse('Invalid HMAC', { status: 403 })

  // Exchange the authorization code for a permanent access token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: apiKey, client_secret: secret, code }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    console.error('[auth/callback] token exchange failed:', tokenRes.status, body)
    return new NextResponse('Token exchange failed', { status: 502 })
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string }

  // Persist the token so we can skip OAuth on future logins
  await connectDB()
  await ShopifyTokenModel.findOneAndUpdate(
    { shop },
    { accessToken: access_token },
    { upsert: true, returnDocument: 'after' },
  )

  // Register the app/uninstalled webhook so we wipe our token from MongoDB
  // when the merchant removes the app — ensuring reinstall always runs fresh OAuth.
  const webhookUrl = `${new URL(req.url).origin}/api/webhooks/shopify`
  const webhookRes = await fetch(`https://${shop}/admin/api/2025-10/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': access_token,
    },
    body: JSON.stringify({
      query: `mutation {
        webhookSubscriptionCreate(
          topic: APP_UNINSTALLED
          webhookSubscription: { callbackUrl: "${webhookUrl}", format: JSON }
        ) {
          userErrors { field message }
        }
      }`,
    }),
  })
  if (!webhookRes.ok) {
    console.error('[auth/callback] webhook registration HTTP error:', webhookRes.status)
  } else {
    const webhookJson = await webhookRes.json()
    const errors = webhookJson?.data?.webhookSubscriptionCreate?.userErrors
    if (errors?.length) {
      // "already registered" is not a real error — Shopify deduplicates by URL+topic
      console.log('[auth/callback] webhook registration result:', JSON.stringify(errors))
    } else {
      console.log('[auth/callback] APP_UNINSTALLED webhook registered for shop:', shop)
    }
  }

  console.log('[auth/callback] installation complete for shop:', shop)

  // Redirect to the Shopify admin. Staff can then open the app from the
  // Apps section, where it loads embedded and proxy.ts issues an auth
  // token from the HMAC-signed load — no cookie needed (see proxy.ts's
  // module comment for why this app doesn't use cookies at all).
  const adminUrl = `https://${shop}/admin`
  console.log('[auth/callback] redirecting to Shopify admin:', adminUrl)
  return NextResponse.redirect(adminUrl)
}
