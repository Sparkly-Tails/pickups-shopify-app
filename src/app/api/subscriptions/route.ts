import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { SubscriptionModel } from '@/models/Subscription'

export async function GET(req: NextRequest) {
  await connectDB()
  const { searchParams } = new URL(req.url)
  const dueThisWeek = searchParams.get('dueThisWeek') === 'true'
  const customerId = searchParams.get('customerId')

  const query: Record<string, unknown> = { status: 'active' }

  if (customerId) {
    query.customerId = customerId
  }

  if (dueThisWeek) {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay() + 1)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)
    query.nextOrderDate = { $gte: weekStart, $lte: weekEnd }
  }

  const subscriptions = await SubscriptionModel.find(query).sort({ nextOrderDate: 1 }).lean()
  return NextResponse.json(subscriptions)
}
