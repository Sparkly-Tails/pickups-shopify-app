'use client'

import { useEffect } from 'react'

type ShopifyGlobal = { idToken?: () => Promise<string> }

// TEMPORARY diagnostic beacon: reports what happens in this component to
// /api/debug/client-log, since there's no way to see browser console output
// from inside the Shopify iPad app's embedded webview. Remove once the
// investigation is done — see report() call sites below.
function report(originalFetch: typeof fetch, event: string, data: Record<string, unknown>) {
  originalFetch('/api/debug/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, ...data, ts: Date.now() }),
  }).catch(() => {})
}

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

    const originalFetch = window.fetch.bind(window)

    // Report unconditionally, first thing, so a total absence of client-log
    // entries can never happen again — a prior version of this diagnostic
    // only reported on success, so "window.shopify never appeared" and
    // "this component never even mounted" were indistinguishable from
    // silence in the logs.
    report(originalFetch, 'provider_mounted', {
      alreadyPatched: !!w.__appBridgeFetchPatched,
      hasShopifyAtMount: !!w.shopify,
    })

    window.addEventListener('error', e => {
      report(originalFetch, 'window_error', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        errorName: e.error?.name,
        errorMessage: e.error?.message,
        errorStack: e.error?.stack,
      })
    })
    window.addEventListener('unhandledrejection', e => {
      report(originalFetch, 'unhandled_rejection', { reason: String(e.reason) })
    })

    if (w.__appBridgeFetchPatched) return
    w.__appBridgeFetchPatched = true

    const origin = window.location.origin

    // One-time diagnostic: does window.shopify appear on THIS mount (every
    // page, not just the manually-clicked diagnostic page), and does
    // idToken() resolve from here.
    const mountStart = Date.now()
    const pollInterval = setInterval(() => {
      if (w.shopify) {
        clearInterval(pollInterval)
        report(originalFetch, 'shopify_global_appeared', { ms: Date.now() - mountStart })
        w.shopify.idToken?.()
          .then(token =>
            report(originalFetch, 'idtoken_ok', { ms: Date.now() - mountStart, len: token.length }))
          .catch(err =>
            report(originalFetch, 'idtoken_error', { ms: Date.now() - mountStart, error: String(err) }))
      }
    }, 100)
    setTimeout(() => {
      clearInterval(pollInterval)
      if (!w.shopify) {
        report(originalFetch, 'shopify_global_timeout', { ms: Date.now() - mountStart })
      }
    }, 8000)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      // Only string/URL inputs are handled — Request-object inputs pass
      // through unmodified (not used by this app's own code or by Next's
      // router/Server Action fetches, which use string URLs).
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : null

      if (url === null || url.startsWith('/api/debug/client-log')) {
        return originalFetch(input, init)
      }

      const isSameOrigin = url.startsWith('/') || url.startsWith(origin)
      const alreadyHasAuth = init?.headers ? new Headers(init.headers).has('Authorization') : false

      if (isSameOrigin && !alreadyHasAuth && w.shopify?.idToken) {
        try {
          const token = await w.shopify.idToken()
          const headers = new Headers(init?.headers)
          headers.set('Authorization', `Bearer ${token}`)
          report(originalFetch, 'fetch_patched', { url })
          return originalFetch(url, { ...init, headers })
        } catch (err) {
          // App Bridge unavailable or idToken() failed — fall through to a
          // plain fetch. proxy.ts still accepts the session cookie if that
          // happens to be present, so this isn't a hard failure.
          report(originalFetch, 'fetch_patch_failed', { url, error: String(err) })
        }
      } else if (isSameOrigin && !alreadyHasAuth) {
        report(originalFetch, 'fetch_skipped_no_shopify', { url })
      }

      return originalFetch(input, init)
    }
  }, [])

  return null
}
