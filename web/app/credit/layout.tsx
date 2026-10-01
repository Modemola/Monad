import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Credit desk",
  description: "Borrow against GPU offtake revenue with the hedge opened in the same transaction, so the lender is repaid at any rental rate.",
  openGraph: { title: "Credit desk · Ingot", description: "Borrow against GPU offtake revenue with the hedge opened in the same transaction, so the lender is repaid at any rental rate." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
