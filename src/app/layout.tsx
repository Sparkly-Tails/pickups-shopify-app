import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import AppBridgeAuthProvider from "@/components/AppBridgeAuthProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sparkly Tails Pickups",
  description: "Pickup confirmation app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Cookie-free auth path (see AppBridgeAuthProvider + proxy.ts
            verifyAppBridgeToken): the session cookie doesn't reliably
            persist in every embedding context (confirmed: works on iPhone
            Shopify app, fails on iPad Shopify app).
            strategy="beforeInteractive" is NOT optional — confirmed via
            crossOrigin (below) exposing the real error: App Bridge's own
            script has a hard guard that ABORTS its entire initialization
            unless it is literally the first <script> tag, loaded
            synchronously with no async/defer/module. strategy=
            "afterInteractive" (tried in v0.3.57 to fix a cold-launch hang)
            inserts the script via JS after hydration — never first, always
            async — so App Bridge silently refused to initialize on every
            single load. beforeInteractive is the only strategy Next.js
            offers that satisfies this, and only works in the root layout.
            The earlier cold-launch hang under beforeInteractive needs
            separate investigation; it isn't caused by App Bridge itself.
            crossOrigin="anonymous": cdn.shopify.com serves
            access-control-allow-origin: *, and without this attribute the
            browser redacts any uncaught exception the script throws down to
            a useless "Script error." with no message/stack — this is what
            revealed the abort-guard message above. Keep it: it's the only
            way AppBridgeAuthProvider's error listener can see real errors
            from this script. */}
        <Script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          strategy="beforeInteractive"
          crossOrigin="anonymous"
        />
        <AppBridgeAuthProvider />
        {children}
      </body>
    </html>
  );
}
