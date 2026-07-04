import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { connectDB } from '@/lib/mongodb'
import { SubscriptionModel } from '@/models/Subscription'
import { syncSubscription } from '@/lib/syncSubscription'

// Shopify signs webhooks with HMAC-SHA256, base64-encoded, in X-Shopify-Hmac-Sha256.
// The secret is the app's Client Secret from Shopify Admin → Apps → API credentials.
function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET!
  const expected = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')
  if (signature.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('x-shopify-hmac-sha256') ?? ''

  if (process.env.SHOPIFY_WEBHOOK_SECRET && !verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const topic = req.headers.get('x-shopify-topic') ?? ''
  const payload = JSON.parse(body) as { admin_graphql_api_id: string }
  const contractId = payload.admin_graphql_api_id

  if (
    ['subscription_contracts/create', 'subscription_contracts/update', 'subscription_contracts/activate'].includes(topic)
  ) {
    await syncSubscription(contractId)
  }

  if (topic === 'subscription_contracts/cancel') {
    await connectDB()
    await SubscriptionModel.updateOne({ _id: contractId }, { status: 'cancelled' })
  }

  return NextResponse.json({ ok: true })
}
