# Sparkly Tails Pickup App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Private Next.js app on Vercel that lets staff confirm Loop subscription pickups and fires Klaviyo confirmation emails, with MongoDB as the store.

**Architecture:** Loop webhooks upsert subscriptions into MongoDB (enriched with Shopify product data). Staff opens the app, confirms pickups per subscription, and a Klaviyo "Pickup Confirmed" event fires. Dashboard shows all pickup history.

**Tech Stack:** Next.js 15 (App Router), Mongoose 8, Axios, MongoDB Atlas, Loop Admin API, Shopify GraphQL Admin API, Klaviyo Events API v2024-02-15, Vercel

## Global Constraints

- Next.js 15 App Router only — no Pages Router, no `getServerSideProps`
- Mongoose 8.x for MongoDB — connection singleton pattern (Task 2)
- Auth: static bearer token (`PICKUP_APP_SECRET`) in all `/api/*` requests. Simpler than Shopify App Bridge for a private dev app — no OAuth needed
- Webhook route (`/api/webhooks/loop`) verified via HMAC only, no bearer token
- Loop API field names (`customer_id`, `billing_policy`, etc.) are best-guess REST conventions — **verify against actual Loop API response before Task 4** using Postman or Loop's API explorer at developer.loopwork.co
- Loop webhook signature header assumed as `x-loop-signature` — verify in Loop webhook docs
- Shopify: Custom App credentials (not OAuth) — `SHOPIFY_ACCESS_TOKEN` from Shopify admin
- Klaviyo Events API revision: `2024-02-15`
- Files under 300 lines
- All secrets in env vars — never hardcoded

## File Map

```
src/
  app/
    layout.tsx
    page.tsx                              # Home — subscriptions due this week
    dashboard/page.tsx                    # Pickup history
    pickup/[subscriptionId]/page.tsx      # Confirm a pickup
    api/
      webhooks/loop/route.ts              # Loop webhook receiver
      subscriptions/route.ts             # GET /api/subscriptions
      subscriptions/[id]/route.ts        # GET /api/subscriptions/:id
      pickups/route.ts                   # GET + POST /api/pickups
  components/
    SubscriptionCard.tsx
    PickupForm.tsx
  lib/
    mongodb.ts                            # Connection singleton
    loop.ts                               # Loop Admin API client
    shopify.ts                            # Shopify GraphQL client
    klaviyo.ts                            # Klaviyo Events API
    syncSubscription.ts                   # Webhook → upsert logic
  models/
    Subscription.ts                       # Mongoose model + TS types
    PickupEvent.ts                        # Mongoose model + TS types
  middleware.ts                           # Bearer token guard
scripts/
  importSubscriptions.ts                  # One-time bulk import
```

---

### Task 1: Project scaffold + environment

**Files:**
- Create: `package.json` (via create-next-app), `.env.local.example`, `src/middleware.ts`

**Interfaces:**
- Produces: running Next.js 15 app with route protection middleware

- [ ] **Step 1: Create the app**

```bash
cd ~/Documents
npx create-next-app@latest sparkly-tails-pickup-app \
  --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git
cd sparkly-tails-pickup-app
```

- [ ] **Step 2: Install dependencies**

```bash
npm install mongoose axios
npm install -D tsx @types/node
```

- [ ] **Step 3: Create `.env.local.example`**

```env
# MongoDB
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/sparkly-tails?retryWrites=true&w=majority

# Loop Subscriptions
LOOP_API_KEY=your_loop_admin_api_key
LOOP_API_BASE=https://api.loopsubscriptions.com/admin/v2
LOOP_WEBHOOK_SECRET=your_loop_webhook_secret

# Shopify Custom App
SHOPIFY_SHOP=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxx

# Klaviyo
KLAVIYO_API_KEY=pk_xxxxxxxxxxxxx

# App
PICKUP_APP_SECRET=generate_a_random_32_char_string_here
APP_URL=http://localhost:3000
```

**How to get each value:**
- `LOOP_API_KEY`: Loop admin → Settings → API → Generate token
- `LOOP_WEBHOOK_SECRET`: created when you register the webhook (Task 8)
- `SHOPIFY_ACCESS_TOKEN`: Shopify Admin → Settings → Apps and sales channels → Develop apps → Create app → configure scopes (`read_products`, `read_customers`) → Install app → reveal token
- `MONGODB_URI`: MongoDB Atlas → Connect → Drivers → copy URI

```bash
cp .env.local.example .env.local
# Fill in values
```

- [ ] **Step 4: Add bearer token middleware**

Create `src/middleware.ts`:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/webhooks')) {
    return NextResponse.next()
  }
  if (request.nextUrl.pathname.startsWith('/api')) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${process.env.PICKUP_APP_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  return NextResponse.next()
}

export const config = { matcher: '/api/:path*' }
```

- [ ] **Step 5: Verify app starts**

```bash
npm run dev
```

Expected: Next.js dev server at http://localhost:3000 with no errors.

- [ ] **Step 6: Init git and commit**

```bash
git init
echo ".env.local" >> .gitignore
git add .
git commit -m "feat: scaffold Next.js 15 app with bearer token middleware"
```

---

### Task 2: MongoDB connection + models

**Files:**
- Create: `src/lib/mongodb.ts`, `src/models/Subscription.ts`, `src/models/PickupEvent.ts`

**Interfaces:**
- Produces:
  - `connectDB(): Promise<void>` — import from `@/lib/mongodb`
  - `SubscriptionModel` + `ISubscription`, `ISubscriptionLine` — from `@/models/Subscription`
  - `PickupEventModel` + `IPickupEvent`, `IPickupItem` — from `@/models/PickupEvent`

- [ ] **Step 1: MongoDB connection singleton**

Create `src/lib/mongodb.ts`:

```typescript
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI!
if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined')

const cache = global as typeof global & {
  mongooseConn: typeof mongoose | null
  mongoosePromise: Promise<typeof mongoose> | null
}

if (!cache.mongooseConn) {
  cache.mongooseConn = null
  cache.mongoosePromise = null
}

export async function connectDB() {
  if (cache.mongooseConn) return cache.mongooseConn
  if (!cache.mongoosePromise) {
    cache.mongoosePromise = mongoose.connect(MONGODB_URI, { bufferCommands: false })
  }
  cache.mongooseConn = await cache.mongoosePromise
  return cache.mongooseConn
}
```

- [ ] **Step 2: Subscription model**

Create `src/models/Subscription.ts`:

```typescript
import { Schema, model, models } from 'mongoose'

export interface ISubscriptionLine {
  loopLineId: string
  shopifyVariantId: string
  productName: string
  qty: number
  unit: string
  price: number
  imageUrl: string
}

export interface ISubscription {
  _id: string
  customerId: string
  customer: { name: string; email: string; shopifyId: string }
  status: 'active' | 'paused' | 'cancelled'
  interval: { frequency: number; unit: string }
  nextOrderDate: Date
  lines: ISubscriptionLine[]
  updatedAt: Date
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    _id: { type: String },
    customerId: { type: String, required: true, index: true },
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      shopifyId: String,
    },
    status: { type: String, enum: ['active', 'paused', 'cancelled'], required: true },
    interval: { frequency: { type: Number, required: true }, unit: { type: String, required: true } },
    nextOrderDate: { type: Date, index: true },
    lines: [
      {
        loopLineId: String,
        shopifyVariantId: String,
        productName: String,
        qty: Number,
        unit: { type: String, default: 'unit' },
        price: Number,
        imageUrl: String,
      },
    ],
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

export const SubscriptionModel =
  models.Subscription || model<ISubscription>('Subscription', SubscriptionSchema)
```

- [ ] **Step 3: PickupEvent model**

Create `src/models/PickupEvent.ts`:

```typescript
import { Schema, model, models, Types } from 'mongoose'

export interface IPickupItem {
  productName: string
  qty: number
  unit: string
  replacement: { name: string; price: number } | null
  escaped: boolean
}

export interface IPickupEvent {
  _id: Types.ObjectId
  subscriptionId: string
  customerId: string
  customerName: string
  date: Date
  weekNumber: number
  subscriptionMonth: string
  notes: string
  emailSent: boolean
  items: IPickupItem[]
  createdAt: Date
}

const PickupEventSchema = new Schema<IPickupEvent>({
  subscriptionId: { type: String, required: true, index: true },
  customerId: { type: String, required: true, index: true },
  customerName: { type: String, required: true },
  date: { type: Date, required: true },
  weekNumber: { type: Number, required: true },
  subscriptionMonth: { type: String, required: true },
  notes: { type: String, default: '' },
  emailSent: { type: Boolean, default: false },
  items: [
    {
      productName: String,
      qty: Number,
      unit: String,
      replacement: { type: { name: String, price: Number }, default: null },
      escaped: { type: Boolean, default: false },
    },
  ],
  createdAt: { type: Date, default: Date.now },
})

export const PickupEventModel =
  models.PickupEvent || model<IPickupEvent>('PickupEvent', PickupEventSchema)
```

- [ ] **Step 4: Smoke test**

Replace `src/app/page.tsx` temporarily:

```tsx
import { connectDB } from '@/lib/mongodb'
import { SubscriptionModel } from '@/models/Subscription'

export default async function Home() {
  await connectDB()
  const count = await SubscriptionModel.countDocuments()
  return <main className="p-8"><p>Subscriptions in DB: {count}</p></main>
}
```

```bash
npm run dev
```

Open http://localhost:3000 — expected: "Subscriptions in DB: 0" with no crash.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mongodb.ts src/models/
git commit -m "feat: MongoDB connection singleton and Subscription/PickupEvent models"
```

---

### Task 3: API clients — Loop, Shopify, Klaviyo

**Files:**
- Create: `src/lib/loop.ts`, `src/lib/shopify.ts`, `src/lib/klaviyo.ts`

**Interfaces:**
- Produces:
  - `loopGet<T>(path: string): Promise<T>` from `@/lib/loop`
  - `loopGetSubscription(id: string): Promise<LoopSubscription>` from `@/lib/loop`
  - `loopGetCustomer(id: string): Promise<LoopCustomer>` from `@/lib/loop`
  - `loopGetAllActiveSubscriptions(): Promise<LoopSubscription[]>` from `@/lib/loop`
  - `LoopSubscription`, `LoopLineItem`, `LoopCustomer` types from `@/lib/loop`
  - `getShopifyVariants(ids: string[]): Promise<Map<string, ShopifyVariant>>` from `@/lib/shopify`
  - `getShopifyCustomer(shopifyId: string): Promise<{ displayName: string; email: string }>` from `@/lib/shopify`
  - `sendPickupConfirmedEvent(params: SendPickupParams): Promise<void>` from `@/lib/klaviyo`

- [ ] **Step 1: Loop API client**

Create `src/lib/loop.ts`:

```typescript
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
```

- [ ] **Step 2: Shopify GraphQL client**

Create `src/lib/shopify.ts`:

```typescript
const SHOPIFY_API_URL = `https://${process.env.SHOPIFY_SHOP}/admin/api/2024-10/graphql.json`

async function shopifyQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(SHOPIFY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data as T
}

export interface ShopifyVariant {
  name: string
  imageUrl: string
  price: number
}

const VARIANTS_QUERY = `
  query getVariants($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        price
        product {
          title
          featuredImage { url }
        }
      }
    }
  }
`

type VariantNode = {
  id: string
  price: string
  product: { title: string; featuredImage: { url: string } | null }
}

export async function getShopifyVariants(variantIds: string[]): Promise<Map<string, ShopifyVariant>> {
  if (variantIds.length === 0) return new Map()
  const data = await shopifyQuery<{ nodes: (VariantNode | null)[] }>(VARIANTS_QUERY, { ids: variantIds })
  const map = new Map<string, ShopifyVariant>()
  for (const node of data.nodes) {
    if (node) {
      map.set(node.id, {
        name: node.product.title,
        imageUrl: node.product.featuredImage?.url ?? '',
        price: parseFloat(node.price),
      })
    }
  }
  return map
}

export async function getShopifyCustomer(shopifyId: string): Promise<{ displayName: string; email: string }> {
  const data = await shopifyQuery<{ customer: { displayName: string; email: string } }>(
    `query { customer(id: "${shopifyId}") { displayName email } }`
  )
  return data.customer
}
```

- [ ] **Step 3: Klaviyo client**

Create `src/lib/klaviyo.ts`:

```typescript
const KLAVIYO_API_URL = 'https://a.klaviyo.com/api/events/'
const KLAVIYO_REVISION = '2024-02-15'

export interface PickupItem {
  product: string
  quantity: number
  unit: string
  replaced_for?: string
}

export interface SendPickupParams {
  email: string
  customerName: string
  weekNumber: number
  subscriptionMonth: string
  itemsPickedUp: PickupItem[]
  itemsRemaining: PickupItem[]
}

export async function sendPickupConfirmedEvent(params: SendPickupParams): Promise<void> {
  const [firstName, ...rest] = params.customerName.trim().split(' ')
  const payload = {
    data: {
      type: 'event',
      attributes: {
        metric: { data: { type: 'metric', attributes: { name: 'Pickup Confirmed' } } },
        profile: {
          data: {
            type: 'profile',
            attributes: { email: params.email, first_name: firstName, last_name: rest.join(' ') },
          },
        },
        properties: {
          week_number: params.weekNumber,
          subscription_month: params.subscriptionMonth,
          items_picked_up: params.itemsPickedUp,
          items_remaining: params.itemsRemaining,
          has_remaining: params.itemsRemaining.length > 0,
        },
      },
    },
  }

  const res = await fetch(KLAVIYO_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_API_KEY}`,
      revision: KLAVIYO_REVISION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (res.status !== 202) {
    const body = await res.text()
    throw new Error(`Klaviyo ${res.status}: ${body}`)
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/loop.ts src/lib/shopify.ts src/lib/klaviyo.ts
git commit -m "feat: Loop, Shopify, and Klaviyo API clients"
```

---

### Task 4: Loop webhook handler + subscription sync

**Files:**
- Create: `src/lib/syncSubscription.ts`, `src/app/api/webhooks/loop/route.ts`

**Interfaces:**
- Consumes: `SubscriptionModel` (Task 2), `loopGetSubscription`, `loopGetCustomer`, `getShopifyVariants`, `getShopifyCustomer` (Task 3)
- Produces: `syncSubscription(loopSubId: string): Promise<void>` from `@/lib/syncSubscription`

- [ ] **Step 1: Create sync function**

Create `src/lib/syncSubscription.ts`:

```typescript
import { connectDB } from '@/lib/mongodb'
import { SubscriptionModel } from '@/models/Subscription'
import { loopGetSubscription, loopGetCustomer } from '@/lib/loop'
import { getShopifyVariants, getShopifyCustomer } from '@/lib/shopify'

export async function syncSubscription(loopSubId: string): Promise<void> {
  await connectDB()
  const loopSub = await loopGetSubscription(loopSubId)

  const variantIds = loopSub.line_items.map(l => l.variant_id)
  const variantMap = await getShopifyVariants(variantIds)

  const lines = loopSub.line_items.map(line => {
    const shopify = variantMap.get(line.variant_id)
    return {
      loopLineId: line.id,
      shopifyVariantId: line.variant_id,
      productName: shopify?.name ?? 'Unknown product',
      qty: line.quantity,
      unit: 'unit',   // Loop doesn't expose unit — set via metafield or manually in DB
      price: shopify?.price ?? 0,
      imageUrl: shopify?.imageUrl ?? '',
    }
  })

  await SubscriptionModel.findOneAndUpdate(
    { _id: loopSub.id },
    {
      _id: loopSub.id,
      customerId: loopSub.customer_id,
      status: loopSub.status,
      interval: { frequency: loopSub.billing_policy.interval_count, unit: loopSub.billing_policy.interval },
      nextOrderDate: new Date(loopSub.next_billing_date),
      lines,
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  // Enrich customer name/email — non-fatal if it fails
  try {
    const loopCust = await loopGetCustomer(loopSub.customer_id)
    const shopifyCust = await getShopifyCustomer(
      `gid://shopify/Customer/${loopCust.shopify_customer_id}`
    )
    await SubscriptionModel.updateOne(
      { _id: loopSub.id },
      {
        'customer.name': shopifyCust.displayName,
        'customer.email': shopifyCust.email,
        'customer.shopifyId': `gid://shopify/Customer/${loopCust.shopify_customer_id}`,
      }
    )
  } catch (err) {
    console.error('Customer enrichment failed:', loopSubId, err)
  }
}
```

- [ ] **Step 2: Create webhook route**

Create `src/app/api/webhooks/loop/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { connectDB } from '@/lib/mongodb'
import { SubscriptionModel } from '@/models/Subscription'
import { syncSubscription } from '@/lib/syncSubscription'

function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.LOOP_WEBHOOK_SECRET!
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export async function POST(req: NextRequest) {
  const body = await req.text()

  // ⚠️ Verify the exact signature header name in Loop's webhook docs
  const signature = req.headers.get('x-loop-signature') ?? ''
  if (process.env.LOOP_WEBHOOK_SECRET && !verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(body) as { topic: string; data: { id: string } }

  if (['subscription.created', 'subscription.updated', 'subscription.reactivated'].includes(event.topic)) {
    await syncSubscription(event.data.id)
  }

  if (event.topic === 'subscription.cancelled') {
    await connectDB()
    await SubscriptionModel.updateOne({ _id: event.data.id }, { status: 'cancelled' })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Test the webhook route**

```bash
# Should return 200 (LOOP_WEBHOOK_SECRET not set yet, signature check skipped)
curl -X POST http://localhost:3000/api/webhooks/loop \
  -H "Content-Type: application/json" \
  -d '{"topic":"subscription.created","data":{"id":"test_123"}}'
```

Expected: `{"ok":true}` (will fail on Loop API call if no API key — expected at this stage)

- [ ] **Step 4: Commit**

```bash
git add src/lib/syncSubscription.ts src/app/api/webhooks/loop/
git commit -m "feat: Loop webhook handler with subscription upsert and Shopify enrichment"
```

---

### Task 5: Subscriptions and Pickups API routes

**Files:**
- Create: `src/app/api/subscriptions/route.ts`, `src/app/api/subscriptions/[id]/route.ts`, `src/app/api/pickups/route.ts`

**Interfaces:**
- Consumes: `SubscriptionModel`, `PickupEventModel`, `sendPickupConfirmedEvent`
- Produces:
  - `GET /api/subscriptions?dueThisWeek=true` → `ISubscription[]`
  - `GET /api/subscriptions/:id` → `{ subscription: ISubscription; recentPickups: IPickupEvent[] }`
  - `POST /api/pickups` body: `{ subscriptionId, date, weekNumber, subscriptionMonth, notes, items: IPickupItem[] }` → `{ ok: true; pickupId: string; emailSent: boolean }`
  - `GET /api/pickups` → `IPickupEvent[]`

- [ ] **Step 1: Subscriptions list**

Create `src/app/api/subscriptions/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { SubscriptionModel } from '@/models/Subscription'

export async function GET(req: NextRequest) {
  await connectDB()
  const dueThisWeek = new URL(req.url).searchParams.get('dueThisWeek') === 'true'

  const query: Record<string, unknown> = { status: 'active' }

  if (dueThisWeek) {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay() + 1)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)
    query.nextOrderDate = { $gte: weekStart, $lte: weekEnd }
  }

  const subscriptions = await SubscriptionModel.find(query).sort({ nextOrderDate: 1 }).lean()
  return NextResponse.json(subscriptions)
}
```

- [ ] **Step 2: Single subscription**

Create `src/app/api/subscriptions/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { SubscriptionModel } from '@/models/Subscription'
import { PickupEventModel } from '@/models/PickupEvent'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB()
  const { id } = await params
  const subscription = await SubscriptionModel.findById(id).lean()
  if (!subscription) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const recentPickups = await PickupEventModel
    .find({ subscriptionId: id })
    .sort({ date: -1 })
    .limit(10)
    .lean()

  return NextResponse.json({ subscription, recentPickups })
}
```

- [ ] **Step 3: Pickups route**

Create `src/app/api/pickups/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { PickupEventModel, IPickupItem } from '@/models/PickupEvent'
import { SubscriptionModel } from '@/models/Subscription'
import { sendPickupConfirmedEvent } from '@/lib/klaviyo'

interface PickupBody {
  subscriptionId: string
  date: string
  weekNumber: number
  subscriptionMonth: string
  notes: string
  items: IPickupItem[]
}

export async function POST(req: NextRequest) {
  await connectDB()
  const body = await req.json() as PickupBody

  const sub = await SubscriptionModel.findById(body.subscriptionId)
  if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })

  const event = await PickupEventModel.create({
    subscriptionId: body.subscriptionId,
    customerId: sub.customerId,
    customerName: sub.customer.name,
    date: new Date(body.date),
    weekNumber: body.weekNumber,
    subscriptionMonth: body.subscriptionMonth,
    notes: body.notes,
    emailSent: false,
    items: body.items,
  })

  const itemsPickedUp = body.items
    .filter(i => !i.escaped)
    .map(i => ({
      product: i.replacement?.name ?? i.productName,
      quantity: i.qty,
      unit: i.unit,
      ...(i.replacement ? { replaced_for: i.productName } : {}),
    }))

  const pickedUpNames = new Set(body.items.filter(i => !i.escaped).map(i => i.productName))
  const itemsRemaining = sub.lines
    .filter(l => !pickedUpNames.has(l.productName))
    .map(l => ({ product: l.productName, quantity: l.qty, unit: l.unit }))

  let emailSent = false
  try {
    await sendPickupConfirmedEvent({
      email: sub.customer.email,
      customerName: sub.customer.name,
      weekNumber: body.weekNumber,
      subscriptionMonth: body.subscriptionMonth,
      itemsPickedUp,
      itemsRemaining,
    })
    await PickupEventModel.updateOne({ _id: event._id }, { emailSent: true })
    emailSent = true
  } catch (err) {
    console.error('Klaviyo error:', err)
  }

  return NextResponse.json({ ok: true, pickupId: event._id.toString(), emailSent })
}

export async function GET(req: NextRequest) {
  await connectDB()
  const { searchParams } = new URL(req.url)
  const query: Record<string, unknown> = {}

  const subscriptionId = searchParams.get('subscriptionId')
  if (subscriptionId) query.subscriptionId = subscriptionId

  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (from || to) {
    query.date = {
      ...(from ? { $gte: new Date(from) } : {}),
      ...(to ? { $lte: new Date(to) } : {}),
    }
  }

  const events = await PickupEventModel.find(query).sort({ date: -1 }).limit(100).lean()
  return NextResponse.json(events)
}
```

- [ ] **Step 4: Test the routes**

```bash
# Subscriptions list
curl -H "Authorization: Bearer test123" http://localhost:3000/api/subscriptions
# Expected: []

# Pickups list
curl -H "Authorization: Bearer test123" http://localhost:3000/api/pickups
# Expected: []
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/
git commit -m "feat: subscriptions and pickups API routes"
```

---

### Task 6: Pickup UI

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/pickup/[subscriptionId]/page.tsx`, `src/components/SubscriptionCard.tsx`, `src/components/PickupForm.tsx`, `src/app/actions/confirmPickup.ts`

**Interfaces:**
- Consumes: `GET /api/subscriptions?dueThisWeek=true`, `GET /api/subscriptions/:id`, `POST /api/pickups`
- Produces: end-to-end pickup flow usable on a phone

- [ ] **Step 1: Home page**

Replace `src/app/page.tsx`:

```tsx
import Link from 'next/link'
import { ISubscription } from '@/models/Subscription'
import SubscriptionCard from '@/components/SubscriptionCard'

async function getSubscriptions(): Promise<ISubscription[]> {
  const res = await fetch(
    `${process.env.APP_URL}/api/subscriptions?dueThisWeek=true`,
    { headers: { Authorization: `Bearer ${process.env.PICKUP_APP_SECRET}` }, cache: 'no-store' }
  )
  return res.json()
}

export default async function Home() {
  const subscriptions = await getSubscriptions()
  return (
    <main className="max-w-lg mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Pickups this week</h1>
        <Link href="/dashboard" className="text-sm text-blue-600">Dashboard →</Link>
      </div>
      {subscriptions.length === 0 && (
        <p className="text-gray-500 text-center py-12">No pickups due this week.</p>
      )}
      <div className="space-y-3">
        {subscriptions.map(sub => <SubscriptionCard key={sub._id} subscription={sub} />)}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: SubscriptionCard**

Create `src/components/SubscriptionCard.tsx`:

```tsx
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
```

- [ ] **Step 3: Pickup page**

Create `src/app/pickup/[subscriptionId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { ISubscription } from '@/models/Subscription'
import { IPickupEvent } from '@/models/PickupEvent'
import PickupForm from '@/components/PickupForm'

async function getData(id: string): Promise<{ subscription: ISubscription; recentPickups: IPickupEvent[] }> {
  const res = await fetch(
    `${process.env.APP_URL}/api/subscriptions/${id}`,
    { headers: { Authorization: `Bearer ${process.env.PICKUP_APP_SECRET}` }, cache: 'no-store' }
  )
  if (!res.ok) notFound()
  return res.json()
}

export default async function PickupPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params
  const { subscription, recentPickups } = await getData(subscriptionId)
  const now = new Date()
  const weekNumber = recentPickups.length + 1
  const subscriptionMonth = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <main className="max-w-lg mx-auto p-4">
      <h1 className="text-xl font-bold mb-1">{subscription.customer.name}</h1>
      <p className="text-sm text-gray-500 mb-6">
        Pickup {weekNumber} — {subscriptionMonth}
      </p>
      <PickupForm
        subscription={subscription}
        weekNumber={weekNumber}
        subscriptionMonth={subscriptionMonth}
      />
    </main>
  )
}
```

- [ ] **Step 4: Server Action for pickup confirmation**

Create `src/app/actions/confirmPickup.ts`:

```typescript
'use server'

import { connectDB } from '@/lib/mongodb'
import { PickupEventModel, IPickupItem } from '@/models/PickupEvent'
import { SubscriptionModel } from '@/models/Subscription'
import { sendPickupConfirmedEvent } from '@/lib/klaviyo'

export interface ConfirmPickupInput {
  subscriptionId: string
  date: string
  weekNumber: number
  subscriptionMonth: string
  notes: string
  items: IPickupItem[]
}

export async function confirmPickup(input: ConfirmPickupInput): Promise<{ ok: boolean; emailSent: boolean }> {
  await connectDB()
  const sub = await SubscriptionModel.findById(input.subscriptionId)
  if (!sub) throw new Error('Subscription not found')

  const event = await PickupEventModel.create({
    subscriptionId: input.subscriptionId,
    customerId: sub.customerId,
    customerName: sub.customer.name,
    date: new Date(input.date),
    weekNumber: input.weekNumber,
    subscriptionMonth: input.subscriptionMonth,
    notes: input.notes,
    emailSent: false,
    items: input.items,
  })

  const itemsPickedUp = input.items
    .filter(i => !i.escaped)
    .map(i => ({
      product: i.replacement?.name ?? i.productName,
      quantity: i.qty,
      unit: i.unit,
      ...(i.replacement ? { replaced_for: i.productName } : {}),
    }))

  const pickedUpNames = new Set(input.items.filter(i => !i.escaped).map(i => i.productName))
  const itemsRemaining = sub.lines
    .filter(l => !pickedUpNames.has(l.productName))
    .map(l => ({ product: l.productName, quantity: l.qty, unit: l.unit }))

  let emailSent = false
  try {
    await sendPickupConfirmedEvent({
      email: sub.customer.email,
      customerName: sub.customer.name,
      weekNumber: input.weekNumber,
      subscriptionMonth: input.subscriptionMonth,
      itemsPickedUp,
      itemsRemaining,
    })
    await PickupEventModel.updateOne({ _id: event._id }, { emailSent: true })
    emailSent = true
  } catch (err) {
    console.error('Klaviyo error:', err)
  }

  return { ok: true, emailSent }
}
```

- [ ] **Step 5: PickupForm**

Create `src/components/PickupForm.tsx`:

```tsx
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
```

- [ ] **Step 5: End-to-end test**

Insert a test subscription in MongoDB (via Atlas UI or mongosh):

```js
db.subscriptions.insertOne({
  _id: "test_sub_1",
  customerId: "cust_1",
  customer: { name: "Test Customer", email: "admin@sparklytails.com", shopifyId: "" },
  status: "active",
  interval: { frequency: 1, unit: "MONTH" },
  nextOrderDate: new Date(),
  lines: [
    { loopLineId: "l1", shopifyVariantId: "", productName: "Royal Canin Adult", qty: 2, unit: "bag", price: 45, imageUrl: "" }
  ],
  updatedAt: new Date()
})
```

1. Open http://localhost:3000 — card appears
2. Click card → pickup form with "Royal Canin Adult"
3. Click "Confirm pickup" → success screen
4. Check http://localhost:3000/api/pickups (with auth header) — event appears

- [ ] **Step 6: Commit**

```bash
git add src/app/ src/components/
git commit -m "feat: pickup UI — subscription list and confirmation form"
```

---

### Task 7: Dashboard

**Files:**
- Create: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET /api/pickups`
- Produces: pickup history list

- [ ] **Step 1: Create dashboard**

Create `src/app/dashboard/page.tsx`:

```tsx
import Link from 'next/link'
import { IPickupEvent } from '@/models/PickupEvent'

async function getPickups(): Promise<IPickupEvent[]> {
  const res = await fetch(
    `${process.env.APP_URL}/api/pickups`,
    { headers: { Authorization: `Bearer ${process.env.PICKUP_APP_SECRET}` }, cache: 'no-store' }
  )
  return res.json()
}

export default async function Dashboard() {
  const pickups = await getPickups()
  return (
    <main className="max-w-2xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/" className="text-sm text-blue-600">← Pickups</Link>
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
                  {new Date(event.date).toLocaleDateString('en-GB')} · Week {event.weekNumber} · {event.subscriptionMonth}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${
                event.emailSent ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                {event.emailSent ? 'Email sent' : 'No email'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {event.items.filter(i => !i.escaped).map((item, i) => (
                <span key={i} className="text-xs bg-gray-100 px-2 py-1 rounded-full">
                  {item.qty}× {item.replacement?.name ?? item.productName}
                </span>
              ))}
              {event.items.filter(i => i.escaped).map((item, i) => (
                <span key={i} className="text-xs bg-red-50 text-red-400 px-2 py-1 rounded-full line-through">
                  {item.productName}
                </span>
              ))}
            </div>
            {event.notes && <p className="mt-2 text-sm text-gray-500 italic">{event.notes}</p>}
          </div>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify**

Open http://localhost:3000/dashboard — shows the test pickup from Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/
git commit -m "feat: pickup history dashboard"
```

---

### Task 8: One-time import + Vercel deploy

**Files:**
- Create: `scripts/importSubscriptions.ts`
- Modify: `package.json` (add script)

**Interfaces:**
- Consumes: `loopGetAllActiveSubscriptions`, `syncSubscription`
- Produces: all Loop active subscriptions in MongoDB; app live on Vercel with webhooks registered

- [ ] **Step 1: Create import script**

Create `scripts/importSubscriptions.ts`:

```typescript
import 'dotenv/config'
import { connectDB } from '../src/lib/mongodb'
import { loopGetAllActiveSubscriptions } from '../src/lib/loop'
import { syncSubscription } from '../src/lib/syncSubscription'

async function main() {
  await connectDB()
  console.log('Fetching active subscriptions from Loop…')
  const subs = await loopGetAllActiveSubscriptions()
  console.log(`Found ${subs.length} subscriptions. Syncing…`)
  for (const sub of subs) {
    try {
      await syncSubscription(sub.id)
      console.log(`✓ ${sub.id}`)
    } catch (err) {
      console.error(`✗ ${sub.id}:`, err)
    }
  }
  console.log('Done.')
  process.exit(0)
}

main()
```

Add to `package.json` scripts:

```json
"import-subs": "tsx --env-file=.env.local scripts/importSubscriptions.ts"
```

- [ ] **Step 2: Deploy to Vercel**

```bash
npx vercel login
npx vercel --prod
```

In Vercel dashboard → Project → Settings → Environment Variables — add all variables from `.env.local`. Set `APP_URL` to the Vercel deployment URL (e.g., `https://sparkly-tails-pickup.vercel.app`).

Redeploy after adding env vars:

```bash
npx vercel --prod
```

- [ ] **Step 3: Register Loop webhook**

In Loop admin → Settings → Webhooks → Add webhook:
- **URL:** `https://your-app.vercel.app/api/webhooks/loop`
- **Events:** `subscription.created`, `subscription.updated`, `subscription.cancelled`, `subscription.reactivated`

Copy the generated webhook secret → add as `LOOP_WEBHOOK_SECRET` in Vercel env vars → redeploy once more.

- [ ] **Step 4: Run the one-time import**

```bash
npm run import-subs
```

Expected:
```
Fetching active subscriptions from Loop…
Found 14 subscriptions. Syncing…
✓ loop_sub_abc
✓ loop_sub_def
…
Done.
```

- [ ] **Step 5: Final check**

Open the Vercel URL — subscriptions due this week appear. Confirm one → pickup appears in dashboard → email lands in Klaviyo.

- [ ] **Step 6: Commit**

```bash
git add scripts/ package.json
git commit -m "feat: bulk import script and deploy instructions"
```
