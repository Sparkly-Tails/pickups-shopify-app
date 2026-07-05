import { notFound } from 'next/navigation'
import Link from 'next/link'
import { connectDB } from '@/lib/mongodb'
import { CustomerModel, IOrderItem } from '@/models/Customer'
import { PickupEventModel, IPickupItem } from '@/models/PickupEvent'
import { getCustomerUnfulfilledOrders } from '@/lib/shopify'
import PickupForm from '@/components/PickupForm'
import LoadOrderForm from '@/components/LoadOrderForm'
import { cancelSubscription } from '@/app/actions/customerActions'

function calcRemaining(orderItems: IOrderItem[], pickedItems: IPickupItem[]): IOrderItem[] {
  const consumed = new Map<string, number>()
  for (const item of pickedItems) {
    if (item.status === 'picked' || item.status === 'swapped') {
      consumed.set(item.productName, (consumed.get(item.productName) ?? 0) + item.qty)
    }
  }
  return orderItems
    .map(oi => ({ ...oi, qty: oi.qty - (consumed.get(oi.productName) ?? 0) }))
    .filter(oi => oi.qty > 0)
}

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>
}) {
  const { customerId } = await params
  await connectDB()

  const customer = await CustomerModel.findById(customerId).lean()
  if (!customer) notFound()

  const pickupHistory = await PickupEventModel.find({
    shopifyCustomerId: customer.shopifyCustomerId,
  })
    .sort({ date: -1 })
    .limit(20)
    .lean()

  let remainingItems: IOrderItem[] = []
  if (customer.currentOrderId) {
    const eventsForOrder = pickupHistory.filter(
      e => e.shopifyOrderId === customer.currentOrderId
    )
    const pickedItems = eventsForOrder.flatMap(e => e.items) as IPickupItem[]
    remainingItems = calcRemaining(customer.currentOrderItems as IOrderItem[], pickedItems)
  }

  const needsNewOrder = !customer.currentOrderId || remainingItems.length === 0
  const unfulfilledOrders = needsNewOrder
    ? await getCustomerUnfulfilledOrders(customer.shopifyCustomerId)
    : []

  return (
    <main className="max-w-lg mx-auto p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Link href="/" className="text-blue-600 text-sm">← Back</Link>
        <h1 className="text-xl font-bold flex-1 text-gray-500">{customer.name}</h1>
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            customer.status === 'active'
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-600'
          }`}
        >
          {customer.status}
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-6">{customer.email}</p>

      {/* Pickup form or load order */}
      {!needsNewOrder ? (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Current order — {remainingItems.reduce((s, i) => s + i.qty, 0)} item(s) remaining
          </h2>
          <PickupForm
            customerId={customerId}
            customerEmail={customer.email}
            remainingItems={remainingItems.map(i => ({
              shopifyLineItemId: i.shopifyLineItemId,
              productName: i.productName,
              qty: i.qty,
            }))}
          />
        </section>
      ) : (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Load next order</h2>
          <LoadOrderForm customerId={customerId} orders={unfulfilledOrders} />
        </section>
      )}

      {/* Pickup history */}
      {pickupHistory.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Pickup History
          </h2>
          <div className="space-y-3">
            {pickupHistory.map(event => (
              <div key={String(event._id)} className="border rounded-xl p-4 bg-white dark:bg-gray-800 dark:border-gray-700">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-medium">
                    {new Date(event.date).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      event.emailSent
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {event.emailSent ? 'Email sent' : 'No email'}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(event.items as IPickupItem[]).map((item, i) => (
                    <span
                      key={i}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        item.status === 'picked'
                          ? 'bg-green-50 text-green-700'
                          : item.status === 'swapped'
                          ? 'bg-yellow-50 text-yellow-700'
                          : 'bg-gray-100 text-gray-400 line-through'
                      }`}
                    >
                      {item.qty}× {item.replacement?.name ?? item.productName}
                    </span>
                  ))}
                </div>
                {event.notes && (
                  <p className="mt-1 text-xs text-gray-400 italic">{event.notes}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cancel subscription */}
      {customer.status === 'active' && (
        <section className="border-t pt-6">
          <form
            action={async () => {
              'use server'
              await cancelSubscription(customerId)
            }}
          >
            <button
              type="submit"
              className="text-sm text-red-500 hover:text-red-700 underline"
            >
              Mark subscription as cancelled
            </button>
          </form>
        </section>
      )}
    </main>
  )
}
