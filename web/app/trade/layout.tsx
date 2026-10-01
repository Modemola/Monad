import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trade compute",
  description: "Go long or short H100 GPU rental rates on Monad: cash-settled swaps on the Ingot index, margined in USDC, with every fill bounded on chain.",
  openGraph: { title: "Trade compute · Ingot", description: "Go long or short H100 GPU rental rates on Monad: cash-settled swaps on the Ingot index, margined in USDC, with every fill bounded on chain." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
