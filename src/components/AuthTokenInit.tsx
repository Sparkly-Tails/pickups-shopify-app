'use client'

import { useEffect } from 'react'
import { setAuthToken, getAuthToken, appendToken } from '@/lib/auth-token'

type WindowWithPatchFlag = { __authFetchPatched?: boolean }

// Seeds the client-side auth token (see src/lib/auth-token.ts) and patches
// window.fetch so every same-origin request — Next.js RSC navigation,
// Server Action invocations, router.refresh(), everything — carries the
// current token as a `stt` query param, and picks up a freshly minted one
// from the `x-auth-token` response header proxy.ts sets on every
// successfully authenticated response. This is what lets navigation keep
// working without any cookie or client-side JS handshake surviving between
// requests.
//
// Mount once, near the top of the root layout body.
export default function AuthTokenInit({ initialToken }: { initialToken: string }) {
  useEffect(() => {
    setAuthToken(initialToken)

    const w = window as unknown as WindowWithPatchFlag
    if (w.__authFetchPatched) return
    w.__authFetchPatched = true

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
      if (!isSameOrigin) {
        return originalFetch(input, init)
      }

      const urlWithToken = appendToken(url, getAuthToken())
      const response = await originalFetch(urlWithToken, init)
      const freshToken = response.headers.get('x-auth-token')
      if (freshToken) setAuthToken(freshToken)
      return response
    }
  }, [initialToken])

  return null
}
