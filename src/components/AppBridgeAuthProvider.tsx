'use client'

import { useEffect } from 'react'

type ShopifyGlobal = { idToken?: () => Promise<string> }

// Attaches a fresh App Bridge session token as an Authorization header to
// every same-origin fetch — this is what makes proxy.ts's verifyAppBridgeToken
// check work for Next.js client-side/RSC navigation, Server Actions, etc.
// Cookie-free, so it works in embedding contexts where cookies don't
// reliably persist (confirmed: the Shopify mobile app's iPad webview,
// despite the CHIPS-partitioned cookie working fine on iPhone).
//
// Renders nothing. Mount once, near the top of the root layout body, after
// the App Bridge <Script> tag.
export default function AppBridgeAuthProvider() {
  useEffect(() => {
    const w = window as unknown as {
      shopify?: ShopifyGlobal
      __appBridgeFetchPatched?: boolean
    }
    if (w.__appBridgeFetchPatched) return
    w.__appBridgeFetchPatched = true

    const originalFetch = window.fetch.bind(window)
    const origin = window.location.origin

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      // Only string/URL inputs are handled — Request-object inputs pass
      // through unmodified (not used by this app's own code or by Next's
      // router/Server Action fetches, which use string URLs).
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : null

      if (url === null) {
        return originalFetch(input, init)
      }

      const isSameOrigin = url.startsWith('/') || url.startsWith(origin)
      const alreadyHasAuth = init?.headers ? new Headers(init.headers).has('Authorization') : false

      if (isSameOrigin && !alreadyHasAuth && w.shopify?.idToken) {
        try {
          const token = await w.shopify.idToken()
          const headers = new Headers(init?.headers)
          headers.set('Authorization', `Bearer ${token}`)
          return originalFetch(url, { ...init, headers })
        } catch {
          // App Bridge unavailable or idToken() failed — fall through to a
          // plain fetch. proxy.ts still accepts the session cookie if that
          // happens to be present, so this isn't a hard failure.
        }
      }

      return originalFetch(input, init)
    }
  }, [])

  return null
}
