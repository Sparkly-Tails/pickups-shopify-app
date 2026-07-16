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

  // App is installed — issue a token in the URL and redirect within the
  // iframe. Staying inside the iframe avoids Shopify admin intercepting any
  // cross-origin navigation and opening the app in a new window.
  // proxy.ts verifies ?stt= the same way it does for any other request —
  // no cookie involved (see proxy.ts's module comment for why).
  console.log('[auth/session] app installed, issuing session for shop:', shop)
  const token = await makeSessionToken(shop, secret)
  const redirectUrl = new URL('/', req.url)
  redirectUrl.searchParams.set('stt', token)
  return NextResponse.redirect(redirectUrl)
}
