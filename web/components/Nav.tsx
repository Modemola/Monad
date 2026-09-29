"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ConnectButton } from "./ConnectButton";

const LINKS = [
  { href: "/", label: "Terminal" },
  { href: "/credit", label: "Credit" },
  { href: "/underwrite", label: "Underwrite" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-hairline">
      {/* Two rows on a phone — brand and wallet, then the sections — because all four items
          in one row pushed the connect button past the viewport edge. One row from sm up. */}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:flex-nowrap sm:gap-x-6 sm:px-6">
        <Link href="/" className="order-1 flex items-center gap-2">
          <IngotMark />
          <span className="text-[15px] font-semibold tracking-tight">Ingot</span>
        </Link>

        <nav className="order-3 flex w-full items-center gap-1 sm:order-2 sm:w-auto">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded px-3 py-1.5 text-[13px] transition-colors ${
                  active
                    ? "bg-raised text-ink"
                    : "text-ink-muted hover:bg-raised/60 hover:text-ink-secondary"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="order-2 ml-auto sm:order-3">
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}

/// A silicon ingot in section: the bar compute is cut from, and the bar a commodity
/// market trades. Same geometry as docs/brand/ingot-mark.svg — change one, change both.
function IngotMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M4 14.5 L7 7.5 L15 7.5 L18 14.5 Z" fill="#3987e5" />
      <path d="M7 7.5 L9 5 L17 5 L15 7.5 Z" fill="#3987e5" opacity="0.55" />
      <path d="M15 7.5 L17 5 L20 12 L18 14.5 Z" fill="#3987e5" opacity="0.3" />
    </svg>
  );
}
