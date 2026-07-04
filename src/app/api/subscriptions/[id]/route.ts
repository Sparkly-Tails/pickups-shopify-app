import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { SubscriptionModel } from '@/models/Subscription'
import { PickupEventModel } from '@/models/PickupEvent'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB()
  const { id } = await params
  const subscription = await SubscriptionModel.findById(id).lean()
  if (!subscription) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const recentPickups = await PickupEventModel
    .find({ subscriptionId: id })
    .sort({ date: -1 })
    .limit(10)
    .lean()

  return NextResponse.json({ subscription, recentPickups })
}
