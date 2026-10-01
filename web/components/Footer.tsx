import Link from "next/link";

import { IngotMark } from "./Nav";

const REPO = "https://github.com/Modemola/Monad";

export function Footer() {
  return (
    <footer className="relative mt-24 px-4 pb-10 sm:px-6">
      <div className="hairline-x mx-auto mb-8 max-w-6xl" />
      <div className="mx-auto flex max-w-6xl flex-col gap-6 text-[12.5px] text-ink-muted sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <IngotMark size={20} />
          <span className="text-ink-secondary">Ingot</span>
          <span className="text-ink-muted/60">·</span>
          <span>Compute, priced and hedged. Built on Monad.</span>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 sm:ml-auto">
          <Link className="transition-colors hover:text-ink" href="/trade">Trade</Link>
          <Link className="transition-colors hover:text-ink" href="/credit">Credit</Link>
          <Link className="transition-colors hover:text-ink" href="/underwrite">Underwrite</Link>
          <a className="transition-colors hover:text-ink" href={`${REPO}/blob/main/docs/BACKTEST.md`}>Backtest</a>
          <a className="transition-colors hover:text-ink" href={`${REPO}/blob/main/docs/SECURITY.md`}>Security</a>
          <a className="transition-colors hover:text-ink" href={REPO}>GitHub</a>
        </nav>
      </div>
      <p className="mx-auto mt-6 max-w-6xl text-[11px] leading-relaxed text-ink-muted/70">
        Testnet software. The USDC is a mock with an open mint so anyone can try it. Index data:
        gpu-rental-prices (CC BY 4.0), on-demand H100 across up to 23 providers a day.
      </p>
    </footer>
  );
}
