import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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
        {/* TEMPORARY: only for /app-bridge-test diagnostics. beforeInteractive
            is required so the script loads blocking/in-order — App Bridge
            warns when loaded async. Root layout is the only place Next.js
            allows this strategy. Remove once the investigation is done. */}
        <Script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
