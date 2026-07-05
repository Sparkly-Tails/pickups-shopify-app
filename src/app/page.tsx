import Link from 'next/link'
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
    <main className="max-w-lg mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Pickups</h1>
        <Link href="/dashboard" className="text-sm text-blue-600">
          Dashboard →
        </Link>
      </div>

      {inProgress.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            In Progress
          </h2>
          <div className="space-y-2">
            {inProgress.map(c => (
              <CustomerRow key={String(c._id)} customer={c} />
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
              <CustomerRow key={String(c._id)} customer={c} dim />
            ))}
          </div>
        </section>
      )}

      {inProgress.length === 0 && needNewCycle.length === 0 && (
        <p className="text-gray-500 text-center py-12">No active customers yet.</p>
      )}

      <Link
        href="/customer/new"
        className="mt-6 block text-center border-2 border-dashed border-gray-300 rounded-xl p-4 text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
      >
        + Add new customer
      </Link>
    </main>
  )
}

function CustomerRow({ customer, dim }: { customer: ICustomer; dim?: boolean }) {
  return (
    <Link
      href={`/customer/${customer._id}`}
      className={`block border rounded-xl p-4 bg-white hover:bg-gray-50 transition-colors ${dim ? 'opacity-60' : ''}`}
    >
      <p className="font-semibold">{customer.name}</p>
      <p className="text-sm text-gray-500">{customer.email}</p>
    </Link>
  )
}
