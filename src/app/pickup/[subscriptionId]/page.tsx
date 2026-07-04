import { notFound } from 'next/navigation'
import { ISubscription } from '@/models/Subscription'
import { IPickupEvent } from '@/models/PickupEvent'
import PickupForm from '@/components/PickupForm'

async function getData(id: string): Promise<{ subscription: ISubscription; recentPickups: IPickupEvent[] }> {
  const res = await fetch(
    `${process.env.APP_URL}/api/subscriptions/${id}`,
    { headers: { Authorization: `Bearer ${process.env.PICKUP_APP_SECRET}` }, cache: 'no-store' }
  )
  if (!res.ok) notFound()
  return res.json()
}

export default async function PickupPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params
  const { subscription, recentPickups } = await getData(subscriptionId)
  const now = new Date()
  const weekNumber = recentPickups.length + 1
  const subscriptionMonth = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <main className="max-w-lg mx-auto p-4">
      <h1 className="text-xl font-bold mb-1">{subscription.customer.name}</h1>
      <p className="text-sm text-gray-500 mb-6">
        Pickup {weekNumber} — {subscriptionMonth}
      </p>
      <PickupForm
        subscription={subscription}
        weekNumber={weekNumber}
        subscriptionMonth={subscriptionMonth}
      />
    </main>
  )
}
