import { redirect } from 'next/navigation'
import { makeSessionToken } from '@/lib/shopify-auth'
import { appendToken } from '@/lib/auth-token'

// Server Action equivalent of AuthLink/useAuthRouter — for the one call
// site (cancelSubscription) that needs to redirect() from inside an
// action. Mints its own fresh token directly (the secret is available
// server-side already) rather than needing one threaded in from the
// client, since Next's redirect() response isn't a URL the client
// constructs.
export async function redirectWithToken(path: string): Promise<never> {
  const shop = process.env.SHOPIFY_SHOP
  const secret = process.env.SHOPIFY_API_SECRET_KEY
  if (shop && secret) {
    const token = await makeSessionToken(shop, secret)
    redirect(appendToken(path, token))
  }
  redirect(path)
}
