"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { ConnectButton } from "./ConnectButton";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/trade", label: "Trade" },
  { href: "/credit", label: "Credit" },
  { href: "/underwrite", label: "Underwrite" },
];

/// A slim bar on a hairline. It steps out of the way while you read down the page and returns the
/// moment you scroll back up. Under the open section sits a small gold ingot that slides between
/// links. On a phone the links move to a dock at the bottom, where a thumb can reach them.
export function Nav() {
  const pathname = usePathname();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const last = useRef(0);

  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 12);
    setHidden(y > 160 && y > last.current);
    last.current = y;
  });

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <motion.header
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: hidden ? -90 : 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-500 ${
          scrolled ? "border-hairline bg-void/80 backdrop-blur-md" : "border-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <IngotMark size={24} />
            <span className="font-display text-[21px] font-light tracking-tight">Ingot</span>
          </Link>

          <nav className="relative ml-6 hidden items-center gap-1 sm:flex">
            {LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} label={link.label} on={active(link.href)} id="nav-ingot" />
            ))}
          </nav>

          <div className="ml-auto">
            <ConnectButton />
          </div>
        </div>
      </motion.header>

      {/* The phone dock. */}
      <motion.nav
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: hidden ? 90 : 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 flex items-center justify-around border border-hairline bg-void/90 px-1 py-1.5 backdrop-blur-md sm:hidden"
      >
        {LINKS.map((link) => (
          <NavLink key={link.href} href={link.href} label={link.label} on={active(link.href)} id="dock-ingot" />
        ))}
      </motion.nav>
    </>
  );
}

function NavLink({ href, label, on, id }: { href: string; label: string; on: boolean; id: string }) {
  return (
    <Link
      href={href}
      className={`relative px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.2em] transition-colors duration-300 ${
        on ? "text-ink" : "text-ink-muted hover:text-ink-secondary"
      }`}
    >
      {label}
      {on && (
        <motion.span
          layoutId={id}
          className="absolute -bottom-0.5 left-1/2 -translate-x-1/2"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        >
          <svg width="14" height="7" viewBox="0 0 14 7" aria-hidden>
            <path d="M2 7 L4 1 L10 1 L12 7 Z" fill="#e8b661" />
            <path d="M4 1 L10 1" stroke="#fff4dc" strokeWidth="0.8" />
          </svg>
          <span className="absolute left-1/2 top-0 h-3 w-6 -translate-x-1/2 -translate-y-1/2 bg-gold/40 blur-md" />
        </motion.span>
      )}
    </Link>
  );
}

/// The brand mark: a silicon ingot in section. Same geometry as docs/brand/ingot-mark.svg, cast in
/// gold — lit front, bright top, shadowed side.
export function IngotMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="im-front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4dc" />
          <stop offset="0.35" stopColor="#e8b661" />
          <stop offset="1" stopColor="#9c6a26" />
        </linearGradient>
        <linearGradient id="im-top" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="1" stopColor="#f6dca6" />
        </linearGradient>
        <linearGradient id="im-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8742c" />
          <stop offset="1" stopColor="#4d3311" />
        </linearGradient>
      </defs>
      <path d="M4 14.5 L7 7.5 L15 7.5 L18 14.5 Z" fill="url(#im-front)" />
      <path d="M7 7.5 L9 5 L17 5 L15 7.5 Z" fill="url(#im-top)" />
      <path d="M15 7.5 L17 5 L20 12 L18 14.5 Z" fill="url(#im-side)" />
    </svg>
  );
}
