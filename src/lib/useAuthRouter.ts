'use client'

import { useRouter } from 'next/navigation'
import { getAuthToken, appendToken } from '@/lib/auth-token'

// Wraps next/navigation's useRouter for programmatic push/replace, so the
// current auth token travels along the same way AuthLink attaches it to
// declarative links. Reads the token client-side (kept fresh by
// AuthTokenInit's fetch patch) since this is called from event handlers,
// not during render, so there's no SSR/hydration concern here.
export function useAuthRouter() {
  const router = useRouter()
  return {
    push: (href: string) => router.push(appendToken(href, getAuthToken())),
    replace: (href: string) => router.replace(appendToken(href, getAuthToken())),
  }
}
