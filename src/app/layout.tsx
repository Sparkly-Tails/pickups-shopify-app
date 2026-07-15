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
            Shopify app, fails on iPad Shopify app). beforeInteractive is
            required so the script loads blocking/in-order — App Bridge
            warns when loaded async, and root layout is the only place
            Next.js allows this strategy. */}
        <Script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" strategy="beforeInteractive" />
        <AppBridgeAuthProvider />
        {children}
      </body>
    </html>
  );
}
