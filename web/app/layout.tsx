import type { Metadata } from "next";

import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Ingot — compute, priced and hedged",
  description:
    "A cash-settled market for GPU rental rates on Monad, and the credit layer it unlocks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
