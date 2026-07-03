import axios from 'axios'

const http = axios.create({
  baseURL: process.env.LOOP_API_BASE,
  headers: {
    Authorization: `Bearer ${process.env.LOOP_API_KEY}`,
    'Content-Type': 'application/json',
  },
})

export async function loopGet<T>(path: string): Promise<T> {
  const res = await http.get<T>(path)
  return res.data
}

// ⚠️ Field names below are assumptions based on REST conventions.
// Verify against actual Loop API response (GET /subscriptions/any-id)
// before Task 4. Adjust if field names differ.
export interface LoopLineItem {
  id: string
  variant_id: string    // Shopify variant GID e.g. "gid://shopify/ProductVariant/123"
  quantity: number
}

export interface LoopSubscription {
  id: string
  customer_id: string
  status: 'active' | 'paused' | 'cancelled'
  billing_policy: { interval_count: number; interval: string }
  next_billing_date: string   // ISO date string
  line_items: LoopLineItem[]
}

export interface LoopCustomer {
  id: string
  shopify_customer_id: string
}

export async function loopGetSubscription(id: string): Promise<LoopSubscription> {
  return loopGet<LoopSubscription>(`/subscriptions/${id}`)
}

export async function loopGetCustomer(id: string): Promise<LoopCustomer> {
  return loopGet<LoopCustomer>(`/customers/${id}`)
}

export async function loopGetAllActiveSubscriptions(): Promise<LoopSubscription[]> {
  const results: LoopSubscription[] = []
  let page = 1
  while (true) {
    const data = await loopGet<{ subscriptions: LoopSubscription[]; hasMore: boolean }>(
      `/subscriptions?status=active&page=${page}&limit=50`
    )
    results.push(...data.subscriptions)
    if (!data.hasMore) break
    page++
  }
  return results
}
