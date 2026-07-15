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
            strategy="afterInteractive" (not beforeInteractive): loading this
            blocking caused the whole app to hang on a cold launch from the
            iPad Shopify app (infinite spinner) — beforeInteractive makes
            Next.js inject the script into the initial HTML and blocks
            hydration/paint until it finishes executing, which apparently
            deadlocks against however Shopify's iPad app chrome sequences
            its own readiness handshake. App Bridge logs a cosmetic "loaded
            async" warning with afterInteractive, but functions correctly
            (idToken() was already confirmed working this way) — a console
            warning beats a hung app. */}
        <Script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" strategy="afterInteractive" />
        <AppBridgeAuthProvider />
        {children}
      </body>
    </html>
  );
}
