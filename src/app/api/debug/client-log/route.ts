import { NextRequest, NextResponse } from 'next/server'

// Diagnostic-only endpoint (temporary): lets client-side code report what
// happened in AppBridgeAuthProvider, since there's no other way to see
// browser console output from inside the Shopify iPad app's embedded
// webview (no remote inspector access). No auth required — this only
// accepts a small diagnostic payload and logs it server-side; nothing it
// receives is sensitive or actionable. Exempted from proxy.ts via the
// existing /api/debug prefix match. Remove once the investigation is done.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  console.log('[client-log]', body)
  return NextResponse.json({ ok: true })
}
