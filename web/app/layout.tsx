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
  title: "Ingot — compute, priced and hedged",
  description: DESCRIPTION,
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
        <Providers>
          <Nav />
          <main className="relative">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
