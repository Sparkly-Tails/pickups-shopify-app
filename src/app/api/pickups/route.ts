import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { PickupEventModel } from '@/models/PickupEvent'

export async function GET(req: NextRequest) {
  await connectDB()
  const { searchParams } = new URL(req.url)
  const query: Record<string, unknown> = {}

  const shopifyCustomerId = searchParams.get('customerId')
  if (shopifyCustomerId) query.shopifyCustomerId = shopifyCustomerId

  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (from || to) {
    query.date = {
      ...(from ? { $gte: new Date(from) } : {}),
      ...(to ? { $lte: new Date(to) } : {}),
    }
  }

  const events = await PickupEventModel.find(query).sort({ date: -1 }).limit(100).lean()
  return NextResponse.json(events)
}
