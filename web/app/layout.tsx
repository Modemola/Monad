import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./globals.css";
import { Providers } from "./providers";
import { Footer } from "@/components/Footer";
import { LiquidBackground } from "@/components/fx/LiquidBackground";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Ingot — compute, priced and hedged",
  description:
    "A cash-settled market for GPU rental rates on Monad, and the credit layer it unlocks.",
};

export const viewport: Viewport = {
  themeColor: "#03040a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen">
        <LiquidBackground />
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
