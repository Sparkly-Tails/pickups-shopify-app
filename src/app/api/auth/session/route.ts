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

  // App is installed — issue a session cookie so this staff member can use the app
  console.log('[auth/session] app installed, issuing session for shop:', shop)
  const sessionToken = await makeSessionToken(shop, secret)
  const res = NextResponse.redirect(new URL('/', req.url))
  res.cookies.set('__shopify_session', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  })
  return res
}
