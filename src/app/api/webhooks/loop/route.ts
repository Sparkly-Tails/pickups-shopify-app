import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { connectDB } from '@/lib/mongodb'
import { SubscriptionModel } from '@/models/Subscription'
import { syncSubscription } from '@/lib/syncSubscription'

function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.LOOP_WEBHOOK_SECRET!
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
  if (signature.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export async function POST(req: NextRequest) {
  const body = await req.text()

  // ⚠️ Verify the exact signature header name in Loop's webhook docs before going live
  const signature = req.headers.get('x-loop-signature') ?? ''
  if (process.env.LOOP_WEBHOOK_SECRET && !verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(body) as { topic: string; data: { id: string } }

  if (['subscription.created', 'subscription.updated', 'subscription.reactivated'].includes(event.topic)) {
    await syncSubscription(event.data.id)
  }

  if (event.topic === 'subscription.cancelled') {
    await connectDB()
    await SubscriptionModel.updateOne({ _id: event.data.id }, { status: 'cancelled' })
  }

  return NextResponse.json({ ok: true })
}
