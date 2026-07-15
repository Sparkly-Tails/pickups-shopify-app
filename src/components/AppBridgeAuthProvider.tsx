'use client'

import { useEffect } from 'react'

type ShopifyGlobal = { idToken?: () => Promise<string> }
type WindowWithShopify = { shopify?: ShopifyGlobal; __appBridgeFetchPatched?: boolean }

// Extended for diagnosis: the previous 8s timeout for window.shopify to
// appear was hit almost exactly (8001ms) with zero errors thrown, which
// only proves the timeout fired — it says nothing about whether App
// Bridge's handshake with the Shopify iPad app's parent frame would
// eventually succeed given more time. The one earlier case where it WAS
// confirmed working (the original diagnostic-page test) happened well
// after the homepage had already been open for a while, not on a cold
// check — so "just needs more time" is a live hypothesis worth testing
// before assuming App Bridge can't work here at all. Tune back down once
// the real distribution is known.
const SHOPIFY_WAIT_TIMEOUT_MS = 20000

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

// Resolves once window.shopify appears, or null after timeoutMs. Memoized
// per mount (see useEffect below) so every same-origin fetch shares the
// SAME wait instead of each starting its own independent poll+timeout.
function waitForShopify(w: WindowWithShopify, timeoutMs: number): Promise<ShopifyGlobal | null> {
  if (w.shopify) return Promise.resolve(w.shopify)
  return new Promise(resolve => {
    const interval = setInterval(() => {
      if (w.shopify) {
        clearInterval(interval)
        clearTimeout(timeout)
        resolve(w.shopify)
      }
    }, 100)
    const timeout = setTimeout(() => {
      clearInterval(interval)
      resolve(null)
    }, timeoutMs)
  })
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
    const w = window as unknown as WindowWithShopify
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
    const mountStart = Date.now()
    const shopifyReady = waitForShopify(w, SHOPIFY_WAIT_TIMEOUT_MS)

    shopifyReady.then(shopify => {
      if (!shopify) {
        report(originalFetch, 'shopify_global_timeout', {
          ms: Date.now() - mountStart,
          timeoutMs: SHOPIFY_WAIT_TIMEOUT_MS,
        })
        return
      }
      report(originalFetch, 'shopify_global_appeared', { ms: Date.now() - mountStart })
      shopify.idToken?.()
        .then(token =>
          report(originalFetch, 'idtoken_ok', { ms: Date.now() - mountStart, len: token.length }))
        .catch(err =>
          report(originalFetch, 'idtoken_error', { ms: Date.now() - mountStart, error: String(err) }))
    })

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

      if (isSameOrigin && !alreadyHasAuth) {
        const waitStart = Date.now()
        // Wait for the SAME shared readiness promise as the mount-time
        // diagnostic, instead of an instant synchronous check — a fetch
        // that fires before App Bridge is ready no longer gives up
        // immediately, it waits (capped) for App Bridge to become ready.
        const shopify = await shopifyReady
        if (shopify?.idToken) {
          try {
            const token = await shopify.idToken()
            const headers = new Headers(init?.headers)
            headers.set('Authorization', `Bearer ${token}`)
            report(originalFetch, 'fetch_patched', { url, waitedMs: Date.now() - waitStart })
            return originalFetch(url, { ...init, headers })
          } catch (err) {
            // idToken() failed even though window.shopify exists — fall
            // through to a plain fetch. proxy.ts still accepts the session
            // cookie if that happens to be present, so this isn't a hard
            // failure.
            report(originalFetch, 'fetch_patch_failed', { url, error: String(err) })
          }
        } else {
          report(originalFetch, 'fetch_skipped_no_shopify', { url, waitedMs: Date.now() - waitStart })
        }
      }

      return originalFetch(input, init)
    }
  }, [])

  return null
}
