'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IOrderItem } from '@/models/Customer'
import { IPickupItem } from '@/models/PickupEvent'
import { confirmPickup } from '@/app/actions/confirmPickup'

type ItemState = {
  productName: string
  qty: number
  status: 'picked' | 'skipped' | 'swapped'
  replacement: string
}

export default function PickupForm({
  customerId,
  customerEmail,
  remainingItems,
}: {
  customerId: string
  customerEmail: string
  remainingItems: IOrderItem[]
}) {
  const router = useRouter()
  const [items, setItems] = useState<ItemState[]>(
    remainingItems.map(i => ({
      productName: i.productName,
      qty: i.qty,
      status: 'picked',
      replacement: '',
    }))
  )
  const [notes, setNotes] = useState('')
  const [testMode, setTestMode] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  function setStatus(idx: number, status: 'picked' | 'skipped' | 'swapped') {
    setItems(prev => prev.map((item, i) => (i === idx ? { ...item, status } : item)))
  }

  function setReplacement(idx: number, value: string) {
    setItems(prev => prev.map((item, i) => (i === idx ? { ...item, replacement: value } : item)))
  }

  async function handleSubmit() {
    if (items.some(i => i.status === 'swapped' && !i.replacement.trim())) {
      alert('Please enter a replacement product name for all swapped items.')
      return
    }
    setSubmitting(true)
    try {
      const payload: IPickupItem[] = items.map(i => ({
        productName: i.productName,
        qty: i.qty,
        status: i.status,
        replacement: i.status === 'swapped' ? { name: i.replacement.trim() } : null,
      }))
      const result = await confirmPickup({
        customerId,
        notes,
        items: payload,
        testEmail: testMode ? testEmail : undefined,
      })
      setEmailSent(result.emailSent)
      setDone(true)
    } catch (err) {
      console.error('Pickup failed:', err)
      alert('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-3">✓</p>
        <p className="text-lg font-semibold">Pickup confirmed!</p>
        <p className="text-sm text-gray-500 mb-6">
          {emailSent ? `Email sent to ${customerEmail}` : 'Pickup saved (email not sent)'}
        </p>
        <button onClick={() => router.push('/')} className="text-blue-600 text-sm">
          ← Back to list
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div
          key={item.productName + idx}
          className={`border rounded-xl p-4 transition-opacity ${item.status === 'skipped' ? 'opacity-40' : ''}`}
        >
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1">
              <p className="font-medium">{item.productName}</p>
              <p className="text-sm text-gray-500">Qty: {item.qty}</p>
            </div>
            <div className="flex gap-1">
              {(['picked', 'skipped', 'swapped'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(idx, s)}
                  className={`text-xs px-2 py-1 rounded-full border capitalize transition-colors ${
                    item.status === s
                      ? s === 'picked'
                        ? 'bg-green-100 text-green-700 border-green-300'
                        : s === 'skipped'
                        ? 'bg-gray-100 text-gray-500 border-gray-300'
                        : 'bg-yellow-100 text-yellow-700 border-yellow-300'
                      : 'bg-white text-gray-400 border-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {item.status === 'swapped' && (
            <input
              type="text"
              placeholder="Replacement product name"
              value={item.replacement}
              onChange={e => setReplacement(idx, e.target.value)}
              className="mt-2 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          )}
        </div>
      ))}

      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        className="w-full border rounded-xl p-3 text-sm resize-none"
        rows={3}
      />

      {/* Test mode */}
      <div className="border rounded-xl p-3 bg-gray-50 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={testMode}
            onChange={e => setTestMode(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-600">Send test email instead</span>
        </label>
        {testMode && (
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="test@example.com"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
        )}
      </div>

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
