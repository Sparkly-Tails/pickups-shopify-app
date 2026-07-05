'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addCustomerByEmail } from '@/app/actions/customerActions'

export default function NewCustomerPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await addCustomerByEmail(email)
      if (result.error) {
        setError(result.error)
      } else {
        router.push(`/customer/${result.customerId}`)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-lg mx-auto p-4">
      <div className="flex items-center gap-3 mb-6">
        <a href="/" className="text-blue-600 text-sm">← Back</a>
        <h1 className="text-xl font-bold">Add Customer</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Customer email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="customer@example.com"
            required
            className="w-full border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <p className="text-red-600 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Find & Add Customer'}
        </button>
      </form>

      <p className="mt-4 text-xs text-gray-400 text-center">
        Searches Shopify by email. If the customer has one unfulfilled order, it will be loaded automatically.
      </p>
    </main>
  )
}
