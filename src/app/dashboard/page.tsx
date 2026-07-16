import { headers } from 'next/headers'
import AuthLink from '@/components/AuthLink'
import { IPickupEvent } from '@/models/PickupEvent'

async function getPickups(): Promise<IPickupEvent[]> {
  const res = await fetch(
    `${process.env.APP_URL}/api/pickups`,
    { headers: { Authorization: `Bearer ${process.env.PICKUP_APP_SECRET}` }, cache: 'no-store' }
  )
  return res.json()
}

export default async function Dashboard() {
  const token = (await headers()).get('x-auth-token') ?? ''
  const pickups = await getPickups()

  return (
    <main className="max-w-2xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <AuthLink href="/" token={token} className="text-sm text-blue-600">← Pickups</AuthLink>
      </div>

      {pickups.length === 0 && (
        <p className="text-gray-500 text-center py-12">No pickups recorded yet.</p>
      )}

      <div className="space-y-2">
        {pickups.map(event => (
          <div key={String(event._id)} className="border rounded-xl p-4 bg-white">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">{event.customerName}</p>
                <p className="text-sm text-gray-500">
                  {event.customerEmail} ·{' '}
                  {new Date(event.date).toLocaleDateString('en-GB')}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  event.emailSent
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {event.emailSent ? 'Email sent' : 'No email'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {event.items.map((item, i) => (
                <span
                  key={i}
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    item.status === 'picked'
                      ? 'bg-green-50 text-green-700'
                      : item.status === 'swapped'
                      ? 'bg-yellow-50 text-yellow-700'
                      : 'bg-gray-100 text-gray-600 line-through'
                  }`}
                >
                  {item.qty}× {item.replacement?.name ?? item.productName}
                </span>
              ))}
            </div>
            {event.notes && (
              <p className="mt-1 text-xs text-gray-600 italic">{event.notes}</p>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
