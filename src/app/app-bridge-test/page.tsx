import AppBridgeTestClient from './AppBridgeTestClient'

// Temporary diagnostic page — not linked from normal navigation flows.
// Checks whether App Bridge's postMessage handshake with the parent frame
// works inside the current embedding context (e.g. the Shopify mobile app's
// WKWebView), before committing to a session-token auth rewrite.
// Exempted from proxy.ts auth so it's reachable even when session/cookie
// auth is broken — that's the whole point of this page. Delete this route,
// AppBridgeTestClient.tsx, the Script tag in layout.tsx, and its proxy.ts
// exemption once done.
export default function AppBridgeTestPage() {
  return <AppBridgeTestClient />
}
