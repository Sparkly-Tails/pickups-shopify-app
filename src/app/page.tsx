import Link from 'next/link'
import { ISubscription } from '@/models/Subscription'
import SubscriptionCard from '@/components/SubscriptionCard'

async function getSubscriptions(): Promise<ISubscription[]> {
  const res = await fetch(
    `${process.env.APP_URL}/api/subscriptions?dueThisWeek=true`,
    { headers: { Authorization: `Bearer ${process.env.PICKUP_APP_SECRET}` }, cache: 'no-store' }
  )
  return res.json()
}

export default async function Home() {
  const subscriptions = await getSubscriptions()
  return (
    <main className="max-w-lg mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Pickups this week</h1>
        <Link href="/dashboard" className="text-sm text-blue-600">Dashboard →</Link>
      </div>
      {subscriptions.length === 0 && (
        <p className="text-gray-500 text-center py-12">No pickups due this week.</p>
      )}
      <div className="space-y-3">
        {subscriptions.map(sub => <SubscriptionCard key={sub._id} subscription={sub} />)}
      </div>
    </main>
  )
}
