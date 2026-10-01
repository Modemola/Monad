import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import "@fontsource-variable/newsreader/standard.css";
import "@fontsource-variable/newsreader/standard-italic.css";
import "./globals.css";
import { Providers } from "./providers";
import { Footer } from "@/components/Footer";
import { Atmosphere } from "@/components/fx/Atmosphere";
import { SmoothScroll } from "@/components/fx/SmoothScroll";
import { Toasts } from "@/components/Toasts";
import { Nav } from "@/components/Nav";

const DESCRIPTION =
  "A cash-settled market for GPU rental rates on Monad, and the credit layer it unlocks.";

// Absolute URLs for link previews. Vercel provides the production host at build time.
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://monad-six-sooty.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Ingot — compute, priced and hedged", template: "%s · Ingot" },
  description: DESCRIPTION,
  applicationName: "Ingot",
  keywords: ["GPU", "H100", "compute", "rental rate", "index", "swaps", "hedging", "credit", "Monad", "DeFi"],
  openGraph: {
    title: "Ingot — compute, priced and hedged",
    description: DESCRIPTION,
    siteName: "Ingot",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ingot — compute, priced and hedged",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#090807",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen">
        <Atmosphere />
        <SmoothScroll />
        <div className="grain" aria-hidden />
        <a
          href="#content"
          className="sr-only z-[100] border border-gold bg-void px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-gold focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <Providers>
          <Nav />
          <main id="content" tabIndex={-1} className="relative outline-none">
            {children}
          </main>
          <Footer />
          <Toasts />
        </Providers>
      </body>
    </html>
  );
}
