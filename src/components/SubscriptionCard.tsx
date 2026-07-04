import Link from 'next/link'
import { ISubscription } from '@/models/Subscription'

export default function SubscriptionCard({ subscription: sub }: { subscription: ISubscription }) {
  const date = new Date(sub.nextOrderDate).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
  return (
    <Link href={`/pickup/${sub._id}`}>
      <div className="border rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-semibold text-lg">{sub.customer.name}</p>
            <p className="text-sm text-gray-500">{sub.customer.email}</p>
          </div>
          <span className="text-sm bg-blue-50 text-blue-700 px-2 py-1 rounded">{date}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {sub.lines.map(line => (
            <span key={line.loopLineId} className="text-xs bg-gray-100 px-2 py-1 rounded-full">
              {line.qty}× {line.productName}
            </span>
          ))}
        </div>
      </div>
    </Link>
  )
}
