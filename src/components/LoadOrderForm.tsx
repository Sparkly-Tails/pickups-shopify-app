'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShopifyOrder } from '@/lib/shopify'
import { loadNewOrder } from '@/app/actions/customerActions'

export default function LoadOrderForm({
  customerId,
  orders,
}: {
  customerId: string
  orders: ShopifyOrder[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLoad(order: ShopifyOrder) {
    setLoading(true)
    setError('')
    try {
      const orderItems = order.lineItems.map(li => ({
        shopifyLineItemId: li.id,
        productName: li.title,
        qty: li.quantity,
        imageUrl: li.imageUrl,
      }))
      await loadNewOrder(customerId, order.id, orderItems)
      router.refresh()
    } catch (err) {
      console.error('Failed to load order:', err)
      setError("Couldn't load this order. Check your connection and try again.")
      setLoading(false)
    }
  }

  if (orders.length === 0) {
    return (
      <div className="border rounded-xl p-4 bg-gray-50 text-center">
        <p className="text-gray-500 text-sm">No unfulfilled orders found in Shopify.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {orders.map(order => (
        <div key={order.id} className="border rounded-xl p-4 bg-white">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium">{order.name}</p>
              <p className="text-sm text-gray-500">
                {new Date(order.createdAt).toLocaleDateString('en-GB')} ·{' '}
                {order.lineItems.length} item{order.lineItems.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => handleLoad(order)}
              disabled={loading}
              className="text-sm bg-blue-600 text-white px-4 min-h-11 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Load order'}
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {order.lineItems.map(li => (
              <li key={li.id} className="text-xs text-gray-500">
                {li.quantity}× {li.title}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
