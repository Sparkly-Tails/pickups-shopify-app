import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac, makeSessionToken } from '@/lib/shopify-auth'
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

  console.log('[auth/callback] installation complete for shop:', shop)

  // Issue a session cookie (SameSite=None so it travels into the Shopify
  // admin iframe when the app is opened from there later).
  const sessionToken = await makeSessionToken(shop, secret)
  // Redirect to the Shopify admin. Staff can then open the app from
  // the Apps section where it will load embedded.
  const adminUrl = `https://${shop}/admin`
  console.log('[auth/callback] redirecting to Shopify admin:', adminUrl)

  const res = NextResponse.redirect(adminUrl)
  res.cookies.set('__shopify_session', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 30 * 24 * 60 * 60, // 30 days — re-OAuth is rare for internal staff
    path: '/',
  })
  return res
}
