# Sparkly Tails Pickup App — Design Spec

## Goal

Private Shopify development app (never published) that lets staff confirm subscription pickups, tracks what was picked up per subscription, and fires Klaviyo confirmation emails. Replaces the Google Apps Script + Google Sheets tracker.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Hosting | Vercel |
| Database | MongoDB Atlas (free tier) |
| Subscriptions | Loop Subscriptions Admin API + webhooks |
| Products & customers | Shopify Admin API (GraphQL) |
| Email | Klaviyo Events API |
| Auth | Shopify session tokens (app bridge) |

## Architecture

```
Loop webhooks ──► POST /api/webhooks/loop ──► upsert subscriptions in MongoDB
Shopify Admin API ──► product/customer enrichment (name, email, image, price)
Staff opens app ──► GET /api/subscriptions?dueThisWeek=true
Staff confirms pickup ──► POST /api/pickups ──► write pickup_event ──► fire Klaviyo
```

## Data Model

### `subscriptions` collection

Synced from Loop on every webhook. One document per Loop subscription.

```js
{
  _id: "loop_sub_abc123",           // Loop subscription ID
  customerId: "loop_cust_xyz",
  customer: {
    name: "María García",
    email: "maria@example.com",
    shopifyId: "gid://shopify/Customer/123"
  },
  status: "active",                 // active | paused | cancelled
  interval: { frequency: 1, unit: "MONTH" },
  nextOrderDate: ISODate("2026-08-01"),
  lines: [
    {
      loopLineId: "line_1",
      shopifyVariantId: "gid://shopify/ProductVariant/456",
      productName: "Royal Canin Adult",
      qty: 2,
      unit: "bag",
      price: 45.00,
      imageUrl: "https://cdn.shopify.com/..."
    }
  ],
  updatedAt: ISODate("2026-07-03")
}
```

### `pickup_events` collection

One document per pickup visit (one per subscription per pickup date).

```js
{
  _id: ObjectId(),
  subscriptionId: "loop_sub_abc123",
  customerId: "loop_cust_xyz",
  customerName: "María García",
  date: ISODate("2026-07-03"),
  weekNumber: 2,
  subscriptionMonth: "July 2026",
  notes: "",
  emailSent: false,
  items: [
    {
      productName: "Royal Canin Adult",
      qty: 2,
      unit: "bag",
      replacement: null,    // { name, price } if substituted
      escaped: false        // true if skipped this pickup
    }
  ],
  createdAt: ISODate("2026-07-03")
}
```

## Key Flows

### 1. Subscription sync (webhook)

Loop fires `subscription.created`, `subscription.updated`, `subscription.cancelled` → `POST /api/webhooks/loop` → upsert into `subscriptions`. Enriches product images/prices from Shopify Admin API on write.

### 2. Staff pickup flow

1. Staff opens `/` — sees list of active subscriptions with next order date this week
2. Taps a customer → sees their subscription line items
3. For each product: mark picked up, skip, or substitute
4. Confirms → `POST /api/pickups` → writes `pickup_event` → fires Klaviyo event
5. Dashboard `/dashboard` shows all pickup events (filterable by date/customer)

### 3. Multiple subscriptions per customer

A customer can have multiple Loop subscriptions (e.g., monthly dry food + bi-weekly raw food). Each appears as a separate card. Staff confirms them independently. Both show on the customer's Klaviyo timeline.

## API Routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/webhooks/loop` | Receive Loop webhook events |
| GET | `/api/subscriptions` | List subscriptions (filter: dueThisWeek, customerId) |
| GET | `/api/subscriptions/[id]` | Single subscription with pickup history |
| POST | `/api/pickups` | Confirm a pickup |
| GET | `/api/pickups` | List pickup events (dashboard data) |

## Auth

Shopify App Bridge session token on every request to the Next.js API. Webhook endpoint verified via Loop HMAC signature header.

## Out of scope (v1)

- Shopify POS integration (future release)
- Customer-facing portal
- Automatic billing cycle detection (staff selects week manually if needed)
