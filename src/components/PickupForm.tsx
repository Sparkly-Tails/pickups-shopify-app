'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ISubscription } from '@/models/Subscription'
import { confirmPickup } from '@/app/actions/confirmPickup'

interface ItemState {
  productName: string
  qty: number
  unit: string
  escaped: boolean
  replacement: { name: string; price: number } | null
}

export default function PickupForm({
  subscription,
  weekNumber,
  subscriptionMonth,
}: {
  subscription: ISubscription
  weekNumber: number
  subscriptionMonth: string
}) {
  const router = useRouter()
  const [items, setItems] = useState<ItemState[]>(
    subscription.lines.map(l => ({
      productName: l.productName,
      qty: l.qty,
      unit: l.unit,
      escaped: false,
      replacement: null,
    }))
  )
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  function toggleEscaped(idx: number) {
    setItems(prev =>
      prev.map((item, i) => (i === idx ? { ...item, escaped: !item.escaped } : item))
    )
  }

  async function handleSubmit() {
    setSubmitting(true)
    await confirmPickup({
      subscriptionId: subscription._id,
      date: new Date().toISOString(),
      weekNumber,
      subscriptionMonth,
      notes,
      items,
    })
    setSubmitting(false)
    setDone(true)
  }

  if (done) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-3">✓</p>
        <p className="text-lg font-semibold">Pickup confirmed!</p>
        <p className="text-sm text-gray-500 mb-6">Email sent to {subscription.customer.email}</p>
        <button onClick={() => router.push('/')} className="text-blue-600 text-sm">
          ← Back to list
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item, idx) => (
        <div
          key={item.productName}
          className={`border rounded-xl p-4 transition-opacity ${item.escaped ? 'opacity-40' : ''}`}
        >
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium">{item.productName}</p>
              <p className="text-sm text-gray-500">{item.qty} × {item.unit}</p>
            </div>
            <button
              onClick={() => toggleEscaped(idx)}
              className={`text-sm px-3 py-1 rounded-full border ${
                item.escaped
                  ? 'bg-gray-100 text-gray-500 border-gray-200'
                  : 'bg-green-50 text-green-700 border-green-200'
              }`}
            >
              {item.escaped ? 'Skipped' : 'Picked up'}
            </button>
          </div>
        </div>
      ))}

      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        className="w-full border rounded-xl p-3 text-sm resize-none"
        rows={3}
      />

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
      >
        {submitting ? 'Confirming…' : 'Confirm pickup'}
      </button>
    </div>
  )
}
