import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Underwriter vault",
  description: "Be the counterparty to every Ingot trade: earn the spread and fees, and carry inventory that is marked continuously.",
  openGraph: { title: "Underwriter vault · Ingot", description: "Be the counterparty to every Ingot trade: earn the spread and fees, and carry inventory that is marked continuously." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
