"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ConnectButton } from "./ConnectButton";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/trade", label: "Trade" },
  { href: "/credit", label: "Credit" },
  { href: "/underwrite", label: "Underwrite" },
];

/// A capsule of glass floating over the page. It tightens and darkens once the page scrolls, and
/// a lit bead slides beneath whichever section is open.
export function Nav() {
  const pathname = usePathname();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4"
    >
      <div
        className={`glass mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 rounded-[22px] px-3 py-2 transition-[background,box-shadow] duration-500 sm:flex-nowrap sm:rounded-full sm:px-3 ${
          scrolled ? "glass-strong" : ""
        }`}
      >
        <Link href="/" className="relative z-[2] order-1 flex items-center gap-2.5 rounded-full py-1 pl-1.5 pr-3">
          <IngotMark size={26} />
          <span className="text-[16px] font-semibold tracking-tight">Ingot</span>
        </Link>

        <nav className="relative z-[2] order-3 -mx-1 flex w-full items-center justify-between gap-0.5 overflow-x-auto sm:order-2 sm:mx-auto sm:w-auto sm:justify-center">
          {LINKS.map((link) => {
            const on = active(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative rounded-full px-3.5 py-1.5 text-[13px] transition-colors duration-300 ${
                  on ? "text-ink" : "text-ink-muted hover:text-ink-secondary"
                }`}
              >
                {on && (
                  <motion.span
                    layoutId="nav-bead"
                    className="absolute inset-0 rounded-full bg-gradient-to-b from-white/[0.14] to-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_24px_-6px_rgba(139,108,255,0.6)]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="relative z-[2] order-2 ml-auto sm:order-3 sm:ml-0">
          <ConnectButton />
        </div>
      </div>
    </motion.header>
  );
}

/// The brand mark: a silicon ingot in section, cut as a gem. Same geometry as
/// docs/brand/ingot-mark.svg — the faces are lit rather than flat.
export function IngotMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="im-front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9cc2ff" />
          <stop offset="0.45" stopColor="#4f8cff" />
          <stop offset="1" stopColor="#5232d6" />
        </linearGradient>
        <linearGradient id="im-top" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffe3a6" />
          <stop offset="1" stopColor="#f3c66f" />
        </linearGradient>
        <linearGradient id="im-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b3fa8" />
          <stop offset="1" stopColor="#140d4a" />
        </linearGradient>
        <filter id="im-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#im-glow)">
        <path d="M4 14.5 L7 7.5 L15 7.5 L18 14.5 Z" fill="url(#im-front)" />
        <path d="M7 7.5 L9 5 L17 5 L15 7.5 Z" fill="url(#im-top)" />
        <path d="M15 7.5 L17 5 L20 12 L18 14.5 Z" fill="url(#im-side)" />
        <path d="M7 7.5 L15 7.5" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="0.5" />
      </g>
    </svg>
  );
}
