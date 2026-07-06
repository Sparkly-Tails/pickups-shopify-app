// All crypto uses Web Crypto API — safe to import in Edge middleware.

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Verify Shopify's HMAC signature on the initial app-load URL. */
export async function verifyShopifyHmac(
  params: URLSearchParams,
  secret: string,
): Promise<boolean> {
  const hmac = params.get('hmac')
  if (!hmac) return false

  const message = [...params.entries()]
    .filter(([k]) => k !== 'hmac')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const digest = await hmacSha256(secret, message)
  return timingSafeEqual(digest, hmac)
}

/** Create a signed session token stored in the httpOnly cookie. */
export async function makeSessionToken(
  shop: string,
  secret: string,
): Promise<string> {
  const ts = Date.now().toString()
  const payload = `${shop}|${ts}`
  const sig = await hmacSha256(secret, payload)
  return `${payload}|${sig}`
}

/** Verify a session token; returns false if tampered or older than 8 h. */
export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<boolean> {
  const parts = token.split('|')
  if (parts.length !== 3) return false
  const [shop, ts, sig] = parts
  if (Date.now() - parseInt(ts) > 8 * 60 * 60 * 1000) return false
  const expected = await hmacSha256(secret, `${shop}|${ts}`)
  return timingSafeEqual(expected, sig)
}
