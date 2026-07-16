'use client'

// App-wide fallback for uncaught errors — without this, a failed Server
// Action (e.g. resetCycle, cancelSubscription) or any other unhandled
// exception falls through to Next's generic default error page instead of
// something that fits the rest of the app and offers a way to retry.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="max-w-lg mx-auto p-4 text-center py-16">
      <p className="text-lg font-semibold text-gray-700">Something went wrong</p>
      <p className="text-sm text-gray-600 mt-2 mb-6">
        Check your connection and try again. If this keeps happening, reopen the app from Shopify admin.
      </p>
      <button
        onClick={reset}
        className="bg-blue-600 text-white px-6 min-h-11 rounded-xl font-semibold"
      >
        Try again
      </button>
    </main>
  )
}
