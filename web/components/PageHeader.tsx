"use client";

import type { ReactNode } from "react";

import { Reveal, SplitWords } from "./fx/motion";

/// The top of every app page: a mono eyebrow, a serif title with one word in molten gold, and
/// whatever live context the page wants on the right.
export function PageHeader({
  eyebrow,
  title,
  accent,
  subtitle,
  aside,
}: {
  eyebrow: string;
  title: string;
  /// The word in the title set in molten italic.
  accent?: string;
  subtitle?: string;
  aside?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-6 pt-2 lg:mb-10 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <Reveal className="eyebrow" y={10}>
          {eyebrow}
        </Reveal>
        <h1 className="mt-3 font-display text-[clamp(2.6rem,5.4vw,4.4rem)] leading-[1] tracking-[-0.015em]">
          <SplitWords
            text={title}
            stagger={0.05}
            wordClassName={(word) => (accent && word.replace(/[.,]/g, "") === accent ? "italic text-molten" : "text-chrome")}
          />
        </h1>
        {subtitle && (
          <Reveal delay={0.2} y={10}>
            <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-ink-secondary">{subtitle}</p>
          </Reveal>
        )}
      </div>
      {aside && (
        <Reveal delay={0.3} y={10}>
          {aside}
        </Reveal>
      )}
    </header>
  );
}

/// The frame every app page sits in: clear of the floating nav, centred, with room to breathe.
export function AppFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-32 sm:px-6 sm:pt-36">{children}</div>;
}
