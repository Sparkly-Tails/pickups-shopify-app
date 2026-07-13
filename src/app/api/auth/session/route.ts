import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac, makeSessionToken } from '@/lib/shopify-auth'
import { connectDB } from '@/lib/mongodb'
import { ShopifyTokenModel } from '@/models/ShopifyToken'

// Issues a session cookie to staff members who open the app from Shopify admin
// but don't have a session yet. Checks that the app is already installed (token
// in MongoDB) before issuing — if not installed, falls back to OAuth.
//
// This avoids requiring limited-access staff to run OAuth themselves, which
// they can't do because app installation requires owner-level permissions.
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

  await connectDB()
  const record = await ShopifyTokenModel.findOne({ shop }).lean()

  if (!record) {
    // App not installed for this shop yet — run OAuth
    console.log('[auth/session] no token found for shop, redirecting to OAuth:', shop)
    const startUrl = new URL('/api/auth/start', req.url)
    searchParams.forEach((v, k) => startUrl.searchParams.set(k, v))
    return NextResponse.redirect(startUrl)
  }

  // App is installed — break out of the Shopify iframe so the cookie lands at
  // top-level (not cross-site), which browsers won't block. The proxy handles
  // the ?session= param, sets the cookie, then redirects back to Shopify admin.
  //
  // We use a link with target="_top" + onclick rather than window.top.location.href
  // directly: Shopify's iframe sandbox requires a user gesture for top-navigation,
  // and without one Chrome opens a new window instead of navigating in place.
  console.log('[auth/session] app installed, issuing session for shop:', shop)
  const sessionToken = await makeSessionToken(shop, secret)
  const redirectUrl = new URL('/', req.url)
  redirectUrl.searchParams.set('session', sessionToken)
  const href = JSON.stringify(redirectUrl.toString())
  return new NextResponse(
    `<!DOCTYPE html><html>
    <head><title>Loading…</title>
    <style>
      body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;
           justify-content:center;height:100vh;margin:0;background:#f6f6f7}
      a{display:inline-block;padding:12px 28px;background:#000;color:#fff;
        border-radius:6px;text-decoration:none;font-size:15px}
    </style>
    </head>
    <body>
      <p style="margin-bottom:16px;color:#6d7175">Opening Pickup App…</p>
      <a id="btn" href=${href} target="_top">Open app →</a>
      <script>document.getElementById('btn').click()</script>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  )
}
