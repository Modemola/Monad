"use client";

import { motion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { IndexChart, RecoveryChart, HEDGED, UNHEDGED } from "@/components/charts";
import { AnimatedNumber, Magnetic, Marquee, Reveal, SplitWords, Tilt } from "@/components/fx/motion";
import { INDEX_SERIES } from "@/lib/story-data";

// ---------------------------------------------------------------------------
// Basis ribbon
// ---------------------------------------------------------------------------

/// Where real providers sat against the index across the 78 days (docs/BACKTEST.md).
const BASIS = [
  ["Voltage Park", -45.3],
  ["GMI Cloud", -44.8],
  ["TensorDock", -37.9],
  ["RunPod", -14.3],
  ["Lambda", 0.1],
  ["Crusoe", 7.2],
  ["CoreWeave", 69.2],
  ["AWS", 237.2],
] as const;

export function BasisRibbon() {
  return (
    <section aria-label="Provider basis against the index" className="relative py-6">
      <Marquee>
        {BASIS.map(([name, basis]) => (
          <span key={name} className="mx-3 inline-flex items-center gap-3 whitespace-nowrap rounded-full border border-white/[0.07] bg-white/[0.03] px-4 py-2 font-mono text-[12px] backdrop-blur-md">
            <span className="text-ink-secondary">{name}</span>
            <span className={basis < 0 ? "text-good" : "text-critical"}>
              {basis > 0 ? "+" : ""}
              {basis.toFixed(1)}%
            </span>
            <span className="text-ink-muted/60">vs index</span>
          </span>
        ))}
        <span className="mx-3 inline-flex items-center gap-2 whitespace-nowrap font-mono text-[12px] text-gold">
          ◆ same GPU · same day · 6.14× apart
        </span>
      </Marquee>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Thesis
// ---------------------------------------------------------------------------

export function Thesis() {
  return (
    <section id="thesis" className="relative mx-auto max-w-6xl scroll-mt-24 px-4 pt-28 sm:px-6">
      <Reveal className="eyebrow">The problem</Reveal>
      <h2 className="mt-5 max-w-4xl font-display text-[clamp(2.4rem,5.6vw,4.8rem)] leading-[1.02] tracking-[-0.015em]">
        <SplitWords
          text="The most important price in AI has no market."
          wordClassName={(w) => (w === "no" || w === "market." ? "italic text-molten" : "text-chrome")}
        />
      </h2>
      <Reveal delay={0.15}>
        <p className="mt-7 max-w-2xl text-[16.5px] leading-relaxed text-ink-secondary">
          Neoclouds borrow billions against GPU rental revenue they cannot lock in. Lenders price
          that risk blind. A month&apos;s rent on an H100 swings like a commodity, but there is
          nowhere to sell it forward.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-4 md:grid-cols-3">
        <FactCard
          delay={0}
          value={59.8}
          format={(n) => `${n.toFixed(1)}%`}
          label="annualised volatility"
          body="Posted on-demand H100 rates over 78 days, up to 23 providers a day. A commodity-grade swing in the input every AI balance sheet runs on."
          accent="from-cobalt/50"
        />
        <FactCard
          delay={0.1}
          value={6.14}
          format={(n) => `${n.toFixed(2)}×`}
          label="dearest ÷ cheapest, every day"
          body="The same GPU, the same day, rented at prices six times apart. That is what no price discovery looks like."
          accent="from-violet/50"
        />
        <FactCard
          delay={0.2}
          value={43750}
          format={(n) => `$${Math.round(n).toLocaleString()}`}
          label="an unhedged lender's loss"
          body="On one ordinary $175k loan if rates fall to $0.80/hr. A quarter of the principal, gone. Hedged: nothing."
          accent="from-gold/50"
        />
      </div>
    </section>
  );
}

function FactCard({
  value,
  format,
  label,
  body,
  accent,
  delay,
}: {
  value: number;
  format: (n: number) => string;
  label: string;
  body: string;
  accent: string;
  delay: number;
}) {
  return (
    <Reveal delay={delay}>
      <Tilt className="h-full">
        <div className="glass spotlight group relative h-full overflow-hidden rounded-3xl p-7">
          <div className={`pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br ${accent} to-transparent opacity-60 blur-3xl transition-opacity duration-700 group-hover:opacity-100`} />
          <div className="relative z-[2]" style={{ transform: "translateZ(40px)" }}>
            <div className="tnum text-[clamp(2.6rem,4.4vw,3.5rem)] font-semibold leading-none tracking-tight text-chrome">
              <AnimatedNumber value={value} format={format} duration={2} />
            </div>
            <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-gold">{label}</div>
            <p className="mt-5 text-[14px] leading-relaxed text-ink-secondary">{body}</p>
          </div>
        </div>
      </Tilt>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// The index, real data
// ---------------------------------------------------------------------------

export function IndexStory() {
  const data = useMemo(
    () => INDEX_SERIES.map(([date, price]) => ({ timestamp: Date.parse(`${date}T12:00:00Z`) / 1000, price })),
    [],
  );
  const prices = INDEX_SERIES.map((row) => row[1]);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const providers = Math.max(...INDEX_SERIES.map((row) => row[3]));

  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-32 sm:px-6">
      <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
        <div>
          <Reveal className="eyebrow">The index</Reveal>
          <h2 className="mt-5 font-display text-[clamp(2.2rem,4.8vw,4rem)] leading-[1.04]">
            <SplitWords text="78 days. Real prices." wordClassName={(w) => (w === "Real" || w === "prices." ? "italic text-aurora" : "text-chrome")} />
          </h2>
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-ink-secondary">
              One observation per provider per day, a trimmed mean across them, published on chain
              by a Chainlink CRE workflow under DON consensus. This is the exact series the backtest
              replays through the contracts.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.2} className="grid grid-cols-3 gap-6 font-mono text-[12px] lg:text-right">
          <MiniFigure label="low" value={`$${lo.toFixed(2)}`} />
          <MiniFigure label="high" value={`$${hi.toFixed(2)}`} />
          <MiniFigure label="providers / day" value={`${providers}`} />
        </Reveal>
      </div>

      <Reveal delay={0.1} className="mt-10">
        <div className="glass rounded-[28px] p-4 sm:p-7">
          <div className="relative z-[2]">
            <IndexChart data={data} height={300} width={980} dateOnly />
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function MiniFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-ink-muted">{label}</div>
      <div className="tnum mt-1 text-[22px] text-ink">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

const STEPS = [
  {
    n: "01",
    title: "An index nobody can fake",
    body: "A Chainlink CRE workflow pulls every venue, takes a per-provider median and a trimmed mean, and lands one DON-signed print on chain. A finality delay and tip-only revocation guard every number before money moves on it.",
    tag: "Chainlink CRE",
    icon: "index",
  },
  {
    n: "02",
    title: "A market in GPU-hours",
    body: "Trade 730 GPU-hour lots, cash-settled to the average index over the delivery window. An underwriter vault quotes every fill, and its inventory skew prices the risk it carries.",
    tag: "Monad",
    icon: "market",
  },
  {
    n: "03",
    title: "Credit that hedges itself",
    body: "Borrow against offtake revenue and the short opens in the same transaction, sized to your basis. Lender recovery stops depending on where the rate goes.",
    tag: "One transaction",
    icon: "credit",
  },
] as const;

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 60%"] });
  const beam = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-36 sm:px-6">
      <Reveal className="eyebrow">How it works</Reveal>
      <h2 className="mt-5 max-w-3xl font-display text-[clamp(2.2rem,4.8vw,4rem)] leading-[1.04]">
        <SplitWords text="Three contracts. One bar of value." wordClassName={(w) => (w === "One" || w === "bar" || w === "of" || w === "value." ? "italic text-molten" : "text-chrome")} />
      </h2>

      <div ref={ref} className="relative mt-16">
        {/* The beam of light that runs through the three steps as the page scrolls. */}
        <div className="absolute left-[27px] top-0 h-full w-px bg-white/[0.06] md:hidden">
          <motion.div className="h-full w-full origin-top bg-gradient-to-b from-cobalt via-violet to-gold" style={{ scaleY: beam }} />
        </div>
        <div className="absolute left-0 top-[27px] hidden h-px w-full bg-white/[0.06] md:block">
          <motion.div
            className="h-full w-full origin-left bg-gradient-to-r from-cobalt via-violet to-gold shadow-[0_0_12px_rgba(139,108,255,0.8)]"
            style={{ scaleX: beam }}
          />
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.n} delay={i * 0.12}>
              <div className="relative pl-16 md:pl-0">
                <div className="absolute left-0 top-0 md:static">
                  <StepOrb icon={step.icon} />
                </div>
                <Tilt className="md:mt-8" max={6}>
                  <div className="glass spotlight rounded-3xl p-6">
                    <div className="relative z-[2]">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[12px] text-gold">{step.n}</span>
                        <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-secondary">
                          {step.tag}
                        </span>
                      </div>
                      <h3 className="mt-4 text-[19px] font-medium tracking-tight text-ink">{step.title}</h3>
                      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-secondary">{step.body}</p>
                    </div>
                  </div>
                </Tilt>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/// A glass orb with a line-art glyph that draws itself in.
function StepOrb({ icon }: { icon: "index" | "market" | "credit" }) {
  const draw = {
    initial: { pathLength: 0, opacity: 0 },
    whileInView: { pathLength: 1, opacity: 1 },
    viewport: { once: true },
    transition: { duration: 1.6, ease: [0.22, 1, 0.36, 1] as const, delay: 0.3 },
  };
  return (
    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.12] bg-gradient-to-b from-white/[0.12] to-white/[0.02] shadow-[0_0_40px_-8px_rgba(139,108,255,0.7),inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-xl">
      <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" stroke="url(#orb-g)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <defs>
          <linearGradient id="orb-g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#8db4ff" />
            <stop offset="1" stopColor="#f3c66f" />
          </linearGradient>
        </defs>
        {icon === "index" && (
          <>
            <motion.path d="M4 24 L10 16 L15 19 L21 9 L28 13" {...draw} />
            <motion.circle cx="21" cy="9" r="2.2" {...draw} />
          </>
        )}
        {icon === "market" && (
          <>
            <motion.path d="M6 22 L10 10 L22 10 L26 22 Z" {...draw} />
            <motion.path d="M10 10 L12 6 L24 6 L22 10" {...draw} />
            <motion.path d="M4 27 L28 27" {...draw} />
          </>
        )}
        {icon === "credit" && (
          <>
            <motion.path d="M16 4 L26 8 V16 C26 22 21 26 16 28 C11 26 6 22 6 16 V8 Z" {...draw} />
            <motion.path d="M11 16 L15 20 L21 12" {...draw} />
          </>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The number that makes the case
// ---------------------------------------------------------------------------

/// A 100,000 GPU-hour offtake hedged at $2.48/hr, financed at 70% LTV: $175,000 of principal,
/// $183,750 of debt, $60,000 of borrower margin. These are the figures
/// `forge test --match-test test_demo_projectionTable` prints from HedgedCredit.project().
const DEBT = 183_750;
const MARGIN = 60_000;
const OFFTAKE = 100_000;

function recovery(price: number) {
  return { hedged: DEBT, unhedged: Math.min(DEBT, OFFTAKE * price + MARGIN) };
}

export function TheCase() {
  const [price, setPrice] = useState(0.8);
  const points = useMemo(
    () => Array.from({ length: 21 }, (_, i) => 0.5 + i * 0.125).map((p) => ({ price: p, ...recovery(p) })),
    [],
  );
  const { unhedged } = recovery(price);
  const shortfall = DEBT - unhedged;

  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-36 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <Reveal className="eyebrow">The number that makes the case</Reveal>
          <h2 className="mt-5 font-display text-[clamp(2.2rem,4.6vw,3.8rem)] leading-[1.04]">
            <SplitWords text="Hedged, the lender is whole at every rate." wordClassName={(w) => (w === "whole" ? "italic text-molten" : "text-chrome")} />
          </h2>
          <Reveal delay={0.1}>
            <p className="mt-5 text-[15.5px] leading-relaxed text-ink-secondary">
              A 100,000 GPU-hour monthly offtake, financed at 70% LTV: $175,000 lent, $183,750 owed.
              Drag the settlement rate and watch where each lender lands. Every value is what{" "}
              <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12.5px] text-gold-soft">HedgedCredit.project()</code>{" "}
              returns on chain.
            </p>
          </Reveal>

          <Reveal delay={0.2} className="mt-8 grid grid-cols-3 gap-3">
            <CaseFigure label="Hedged" value={DEBT} colour={HEDGED} />
            <CaseFigure label="Unhedged" value={unhedged} colour={UNHEDGED} />
            <CaseFigure label="Shortfall" value={shortfall} colour={shortfall > 0 ? UNHEDGED : "#7c849f"} />
          </Reveal>

          <Reveal delay={0.3} className="mt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-[13px] text-ink-secondary">Settlement rate</span>
              <span className="tnum font-mono text-[20px] text-ink">${price.toFixed(2)}<span className="text-[12px] text-ink-muted"> / GPU-hr</span></span>
            </div>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.01}
              value={price}
              onChange={(event) => setPrice(Number(event.target.value))}
              className="w-full"
              aria-label="Settlement rate"
            />
            <div className="mt-2 flex justify-between font-mono text-[10.5px] text-ink-muted">
              <span>$0.50</span>
              <span>$3.00</span>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <div className="glass rounded-[28px] p-5 sm:p-7">
            <div className="relative z-[2]">
              <RecoveryChart data={points} marker={price} height={360} width={600} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CaseFigure({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <div className="glass rounded-2xl px-4 py-3.5">
      <div className="relative z-[2]">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">{label}</div>
        <div className="tnum mt-1.5 text-[clamp(1.05rem,2vw,1.45rem)] font-semibold tracking-tight" style={{ color: colour, textShadow: `0 0 24px ${colour}55` }}>
          ${Math.round(value).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Built with
// ---------------------------------------------------------------------------

const STACK = [
  {
    name: "Monad",
    line: "Every fill, every hedge, in one block",
    body: "Sub-second finality is what lets a loan and its hedge open atomically, and lets the mark track the index in real time.",
    glow: "from-violet/60",
  },
  {
    name: "Chainlink CRE",
    line: "The index, by DON consensus",
    body: "A workflow that fetches every venue, aggregates by median across nodes, and writes one signed report. No single key can move the price.",
    glow: "from-cobalt/60",
  },
  {
    name: "Envio HyperIndex",
    line: "Both sides of every trade",
    body: "The vault never trades directly, so the indexer derives its book from every other fill, and is proven to the unit against the contracts.",
    glow: "from-gold/60",
  },
] as const;

export function BuiltWith() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-36 sm:px-6">
      <Reveal className="eyebrow">Built with</Reveal>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {STACK.map((item, i) => (
          <Reveal key={item.name} delay={i * 0.1}>
            <Tilt className="h-full" max={7}>
              <div className="glass spotlight group relative h-full overflow-hidden rounded-3xl p-7">
                <div className={`pointer-events-none absolute -bottom-20 left-1/2 h-40 w-64 -translate-x-1/2 rounded-full bg-gradient-to-t ${item.glow} to-transparent opacity-40 blur-3xl transition-opacity duration-700 group-hover:opacity-90`} />
                <div className="relative z-[2]">
                  <div className="font-display text-[34px] italic leading-none text-chrome">{item.name}</div>
                  <div className="mt-3 text-[13.5px] font-medium text-gold-soft">{item.line}</div>
                  <p className="mt-4 text-[13.5px] leading-relaxed text-ink-secondary">{item.body}</p>
                </div>
              </div>
            </Tilt>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Closing
// ---------------------------------------------------------------------------

export function Closing() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-40 sm:px-6">
      <Reveal>
        <div className="glass relative overflow-hidden rounded-[36px] px-6 py-20 text-center sm:px-16 sm:py-24">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 animate-spin-slow rounded-full bg-[conic-gradient(from_0deg,rgba(79,140,255,0.28),rgba(139,108,255,0.22),rgba(243,198,111,0.3),rgba(79,140,255,0.28))] blur-3xl" />
          <div className="relative z-[2]">
            <h2 className="mx-auto max-w-3xl font-display text-[clamp(2.6rem,6vw,5.2rem)] leading-[1]">
              <SplitWords text="Price the future of compute." wordClassName={(w) => (w === "future" ? "italic text-molten" : "text-chrome")} />
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-[15.5px] leading-relaxed text-ink-secondary">
              Test USDC is one click away. Open a position, draw a hedged loan, or underwrite the
              book, all on Monad testnet.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Magnetic>
                <Link
                  href="/trade"
                  className="gloss inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-gold-soft via-gold to-gold-deep px-7 py-3.5 text-[15px] font-semibold text-[#1d1203] shadow-[0_18px_50px_-14px_rgba(243,198,111,0.9),inset_0_1px_0_rgba(255,255,255,0.75)]"
                >
                  Start trading →
                </Link>
              </Magnetic>
              <Magnetic strength={0.2}>
                <Link
                  href="/credit"
                  className="gloss inline-flex items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.05] px-6 py-3.5 text-[15px] font-medium text-ink backdrop-blur-xl hover:border-white/[0.28]"
                >
                  Draw a hedged loan
                </Link>
              </Magnetic>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
