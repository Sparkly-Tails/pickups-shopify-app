import Link from 'next/link'
import type { ComponentProps } from 'react'
import { appendToken } from '@/lib/auth-token'

// Drop-in replacement for next/link that appends the current auth token to
// the href. Takes `token` as an explicit prop (read server-side via
// headers() in the page and threaded down) rather than a client hook, so
// this works correctly in Server Components and avoids an SSR/hydration
// mismatch on first render. Every internal link in the app must use this
// instead of next/link directly — see the no-restricted-imports ESLint
// rule — since a missed one silently drops auth with no error, only
// surfacing as a 403 on whichever device doesn't have a working cookie.
type AuthLinkProps = ComponentProps<typeof Link> & { token: string }

export default function AuthLink({ href, token, ...rest }: AuthLinkProps) {
  const finalHref = typeof href === 'string' ? appendToken(href, token) : href
  return <Link href={finalHref} {...rest} />
}
