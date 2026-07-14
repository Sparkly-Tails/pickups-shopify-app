# Pickups

A private Shopify app for Sparkly Tails staff to track pet food subscription pickups in-store. Replaces the old Google Sheets tracker.

## What it does

- Shows which subscription customers are due for a pickup and what's left in their current order
- Lets staff check off items as picked up, swapped for a different product, or skipped
- Automatically emails the customer a pickup confirmation via Klaviyo
- Keeps a full pickup history per customer

## Using the app

Open **Pickups** from the Shopify admin (desktop or the Shopify mobile app) — it only works launched from there, not as a standalone website.

1. **Homepage** — customers due for a pickup are listed under "In Progress." Tap a customer to open their page.
2. **Confirm a pickup** — on the customer's page, mark each item as **Picked**, **Swapped** (pick a replacement), or **Skipped**, then submit. This sends the confirmation email automatically.
3. **Start a new cycle** — once all items on an order are accounted for, the customer moves to "Ready for New Cycle." Open their page and load their next unfulfilled Shopify order.
4. **Add a customer** — use the **+ Add new customer** button on the homepage.
5. **Dashboard** — the link at the top of the homepage shows pickup history across all customers.

If the app won't open or shows an "Access restricted" message, close and reopen it from the Shopify admin — it doesn't work if bookmarked or opened directly.

## For developers

Stack: Next.js (App Router) · MongoDB Atlas · Shopify Admin API · Klaviyo · Vercel.

```bash
npm install
cp .env.local.example .env.local   # fill in real values
npm run dev
```

Env vars are documented in `.env.local.example`. Never commit `.env.local` or put secrets in `NEXT_PUBLIC_` variables.

Deploys to Vercel on push to `main`. Bump the `version` in `package.json` with every change — it's shown in the app header, which is the fastest way to confirm a deploy landed.

More detail:
- [`docs/specs/`](docs/specs) — original design spec (some sections predate the current order-based flow; the source code is the source of truth)
- [`docs/plans/`](docs/plans) — implementation plan
