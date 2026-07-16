import { headers } from 'next/headers'
import AuthLink from '@/components/AuthLink'
import { version } from '../../package.json'
import { connectDB } from '@/lib/mongodb'
import { CustomerModel, ICustomer, IOrderItem } from '@/models/Customer'
import { PickupEventModel, IPickupItem } from '@/models/PickupEvent'

function calcRemaining(orderItems: IOrderItem[], pickedItems: IPickupItem[]): number {
  const consumed = new Map<string, number>()
  for (const item of pickedItems) {
    if (item.status === 'picked' || item.status === 'swapped') {
      consumed.set(item.productName, (consumed.get(item.productName) ?? 0) + item.qty)
    }
  }
  return orderItems
    .map(oi => oi.qty - (consumed.get(oi.productName) ?? 0))
    .filter(qty => qty > 0)
    .reduce((sum, qty) => sum + qty, 0)
}

export default async function Home() {
  const token = (await headers()).get('x-auth-token') ?? ''

  await connectDB()

  const customers = await CustomerModel.find({ status: 'active' }).lean()

  const activeIds = customers
    .filter(c => c.currentOrderId)
    .map(c => c.shopifyCustomerId)

  const events = await PickupEventModel.find({
    shopifyCustomerId: { $in: activeIds },
  }).lean()

  const inProgress: typeof customers = []
  const needNewCycle: typeof customers = []

  for (const c of customers) {
    if (!c.currentOrderId) {
      needNewCycle.push(c)
      continue
    }
    const custEvents = events.filter(
      e =>
        e.shopifyCustomerId === c.shopifyCustomerId &&
        e.shopifyOrderId === c.currentOrderId
    )
    const pickedItems = custEvents.flatMap(e => e.items) as IPickupItem[]
    const remaining = calcRemaining(c.currentOrderItems as IOrderItem[], pickedItems)
    if (remaining === 0) {
      needNewCycle.push(c)
    } else {
      inProgress.push(c)
    }
  }

  return (
    <main className="w-[70%] max-w-2xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">
          Pickups <span className="text-xs font-normal text-gray-400">v{version}</span>
        </h1>
        <AuthLink href="/dashboard" token={token} className="text-sm text-blue-600">
          Dashboard →
        </AuthLink>
      </div>

      {inProgress.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            In Progress
          </h2>
          <div className="space-y-2">
            {inProgress.map(c => (
              <CustomerRow key={String(c._id)} customer={c} token={token} />
            ))}
          </div>
        </section>
      )}

      {needNewCycle.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Ready for New Cycle
          </h2>
          <div className="space-y-2">
            {needNewCycle.map(c => (
              <CustomerRow key={String(c._id)} customer={c} dim token={token} />
            ))}
          </div>
        </section>
      )}

      {inProgress.length === 0 && needNewCycle.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-2">No active customers yet.</p>
          <AuthLink href="/customer/new" token={token} className="text-sm text-blue-600 hover:underline">
            Add your first customer →
          </AuthLink>
        </div>
      )}

      <AuthLink
        href="/customer/new"
        token={token}
        className="mt-6 block text-center border-2 border-dashed border-gray-300 rounded-xl p-4 text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
      >
        + Add new customer
      </AuthLink>
    </main>
  )
}

function CustomerRow({ customer, dim, token }: { customer: ICustomer; dim?: boolean; token: string }) {
  return (
    <AuthLink
      href={`/customer/${customer._id}`}
      token={token}
      className="block border rounded-xl p-4 bg-white dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-700 dark:text-gray-200">{customer.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{customer.email}</p>
        </div>
        {dim && (
          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 whitespace-nowrap">
            New cycle
          </span>
        )}
      </div>
    </AuthLink>
  )
}
