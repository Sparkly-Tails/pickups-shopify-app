'use client'

import { useEffect, useState } from 'react'

type Status = 'pending' | 'ok' | 'error' | 'timeout'

export default function AppBridgeTestClient() {
  const [shopifyGlobalStatus, setShopifyGlobalStatus] = useState<Status>('pending')
  const [shopifyGlobalMs, setShopifyGlobalMs] = useState<number | null>(null)
  const [tokenStatus, setTokenStatus] = useState<Status>('pending')
  const [tokenResult, setTokenResult] = useState<string>('')
  const [tokenMs, setTokenMs] = useState<number | null>(null)
  const [runCount, setRunCount] = useState(0)

  const [staticInfo] = useState(() => {
    if (typeof window === 'undefined') return null
    return {
      framed: window.top !== window.self,
      referrer: document.referrer || '(empty)',
      userAgent: navigator.userAgent,
      href: window.location.href,
    }
  })

  // Poll for window.shopify appearing — the script tag is rendered directly
  // in the server HTML (blocking, in document order) so App Bridge doesn't
  // complain about async loading, but it still initializes asynchronously.
  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      const w = window as unknown as { shopify?: { idToken?: unknown } }
      if (w.shopify) {
        setShopifyGlobalStatus('ok')
        setShopifyGlobalMs(Date.now() - start)
        clearInterval(interval)
      }
    }, 100)
    const giveUp = setTimeout(() => {
      clearInterval(interval)
      setShopifyGlobalStatus(s => (s === 'pending' ? 'timeout' : s))
      setShopifyGlobalMs(m => (m === null ? Date.now() - start : m))
    }, 8000)
    return () => {
      clearInterval(interval)
      clearTimeout(giveUp)
    }
  }, [])

  async function callIdToken() {
    setTokenStatus('pending')
    setTokenResult('')
    setRunCount(c => c + 1)
    const start = Date.now()

    const w = window as unknown as { shopify?: { idToken?: () => Promise<string> } }
    if (!w.shopify || typeof w.shopify.idToken !== 'function') {
      setTokenStatus('error')
      setTokenResult('window.shopify.idToken is not a function — App Bridge global never initialized')
      setTokenMs(Date.now() - start)
      return
    }

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('idToken() timed out after 8s — no response from parent frame')), 8000)
    )

    try {
      const token = await Promise.race([w.shopify.idToken(), timeout])
      setTokenStatus('ok')
      setTokenResult(`length=${token.length}, prefix=${token.slice(0, 16)}...`)
      setTokenMs(Date.now() - start)
    } catch (err) {
      setTokenStatus('error')
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      setTokenResult(message)
      setTokenMs(Date.now() - start)
    }
  }

  useEffect(() => {
    if (shopifyGlobalStatus === 'ok' && runCount === 0) {
      callIdToken()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopifyGlobalStatus])

  return (
    <main className="max-w-xl mx-auto p-4 text-sm font-mono">
      <h1 className="text-lg font-bold mb-4">App Bridge Diagnostics</h1>

      <Section title="Context">
        {staticInfo ? (
          <>
            <Row label="Framed (top !== self)" value={String(staticInfo.framed)} />
            <Row label="document.referrer" value={staticInfo.referrer} />
            <Row label="location.href" value={staticInfo.href} />
            <Row label="userAgent" value={staticInfo.userAgent} />
          </>
        ) : (
          <p>loading...</p>
        )}
      </Section>

      <Section title="window.shopify global">
        <Row label="status" value={shopifyGlobalStatus} highlight />
        <Row label="time to appear" value={shopifyGlobalMs !== null ? `${shopifyGlobalMs}ms` : '—'} />
      </Section>

      <Section title="shopify.idToken()">
        <Row label="status" value={tokenStatus} highlight />
        <Row label="time" value={tokenMs !== null ? `${tokenMs}ms` : '—'} />
        <Row label="result" value={tokenResult || '—'} wrap />
        <button
          onClick={callIdToken}
          disabled={shopifyGlobalStatus !== 'ok'}
          className="mt-2 px-3 py-1.5 rounded bg-blue-600 text-white text-xs disabled:opacity-40"
        >
          Retry idToken()
        </button>
      </Section>

      <p className="text-xs text-gray-400 mt-6">
        Screenshot this whole page and send it back — that&apos;s everything needed to
        diagnose whether App Bridge works in this embedding context.
      </p>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 border rounded-lg p-3 dark:border-gray-700">
      <h2 className="font-semibold mb-2 text-xs uppercase tracking-wider text-gray-500">{title}</h2>
      {children}
    </div>
  )
}

function Row({
  label,
  value,
  highlight,
  wrap,
}: {
  label: string
  value: string
  highlight?: boolean
  wrap?: boolean
}) {
  const color =
    highlight && value === 'ok'
      ? 'text-green-600'
      : highlight && (value === 'error' || value === 'timeout')
        ? 'text-red-600'
        : ''
  return (
    <div className="flex gap-2 py-0.5">
      <span className="text-gray-400 shrink-0">{label}:</span>
      <span className={`${color} ${wrap ? 'break-all' : 'truncate'}`}>{value}</span>
    </div>
  )
}
