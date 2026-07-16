// Client-side auth token state. Plain module-level variable, not React
// state — nothing needs to re-render when it changes. It's read
// imperatively at the moment a same-origin fetch fires (AuthTokenInit's
// fetch patch) or a programmatic navigation happens (useAuthRouter).
// Links get their token server-side instead (see AuthLink + the
// `x-auth-token` request header proxy.ts sets), which avoids an
// SSR/hydration mismatch on the very first render.
let currentToken = ''

export function setAuthToken(token: string) {
  currentToken = token
}

export function getAuthToken(): string {
  return currentToken
}

/** Appends `token` as the `stt` query param, preserving any existing query string. */
export function appendToken(href: string, token: string): string {
  if (!token) return href
  const [path, query = ''] = href.split('?')
  const params = new URLSearchParams(query)
  params.set('stt', token)
  return `${path}?${params.toString()}`
}
