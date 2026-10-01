"use client";

import { motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { HEDGED, IndexChart, RecoveryChart, UNHEDGED } from "@/components/charts";
import { AnimatedNumber, Magnetic, Marquee, Reveal, SplitWords } from "@/components/fx/motion";
import { SplitFlap, providerBoard } from "@/components/fx/SplitFlap";
import { Hallmarks } from "@/components/ui";
import { INDEX_SERIES } from "@/lib/story-data";

const PriceColumns = dynamic(() => import("@/components/hero/PriceColumns"), { ssr: false });

const LATEST = INDEX_SERIES[INDEX_SERIES.length - 1][1];

/// Where real providers sat against the index across the 78 days (docs/BACKTEST.md).
const BASIS = [
  ["Voltage Park", -0.453],
  ["GMI Cloud", -0.448],
  ["TensorDock", -0.379],
  ["RunPod", -0.143],
  ["Lambda", 0.001],
  ["Crusoe", 0.072],
  ["CoreWeave", 0.692],
  ["AWS", 2.372],
] as const;

function Label({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

function goldWords(...words: string[]) {
  return (word: string) => (words.includes(word.replace(/[.,]/g, "")) ? "italic text-molten" : "text-ink");
}

// ---------------------------------------------------------------------------
// The board under the hero
// ---------------------------------------------------------------------------

export function TickerBand() {
  const stats = [
    { v: `$${LATEST.toFixed(4)}`, l: "H100 index / GPU-hr" },
    { v: "59.8%", l: "Annualised volatility" },
    { v: "6.14×", l: "Dearest ÷ cheapest" },
    { v: "23", l: "Providers a day" },
    { v: "1 tx", l: "Loan + hedge" },
  ];
  return (
    <section aria-label="Key figures" className="relative border-y border-hairline bg-coal/80">
      <div className="mx-auto grid max-w-6xl grid-cols-2 sm:grid-cols-5">
        {stats.map((s, i) => (
          <Reveal
            key={s.l}
            delay={i * 0.06}
            y={10}
            className={`border-hairline px-4 py-7 text-center ${i < 4 ? "sm:border-r" : ""} ${i % 2 === 0 && i < 4 ? "max-sm:border-r" : ""} ${i < 4 ? "max-sm:border-b" : ""} ${i === 4 ? "max-sm:col-span-2" : ""}`}
          >
            <div className="tnum font-mono text-[22px] text-gold sm:text-[26px]">{s.v}</div>
            <div className="label mt-2">{s.l}</div>
          </Reveal>
        ))}
      </div>
      <Marquee className="border-t border-hairline py-3">
        {BASIS.map(([name, b]) => (
          <span key={name} className="mx-6 inline-flex items-center gap-3 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.16em]">
            <span className="text-ink-muted">{name}</span>
            <span className="text-ink-secondary">${(LATEST * (1 + b)).toFixed(2)}</span>
            <span className={b < 0 ? "text-good" : "text-critical"}>
              {b > 0 ? "+" : ""}
              {(b * 100).toFixed(1)}%
            </span>
            <span className="text-gold/50">◆</span>
          </span>
        ))}
      </Marquee>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Thesis
// ---------------------------------------------------------------------------

export function Thesis() {
  return (
    <section id="thesis" className="relative mx-auto max-w-6xl scroll-mt-24 px-4 pt-32 sm:px-6">
      <Reveal>
        <Label>I — The problem</Label>
      </Reveal>
      <h2 className="text-balance mt-5 max-w-4xl font-display text-[clamp(2.3rem,5.4vw,4.6rem)] font-light leading-[1.03] tracking-[-0.02em]">
        <SplitWords text="The most important price in AI has no market." wordClassName={goldWords("no", "market")} />
      </h2>
      <Reveal delay={0.15}>
        <p className="mt-7 max-w-2xl text-[16px] leading-relaxed text-ink-secondary">
          Neoclouds borrow billions against GPU rental revenue they cannot lock in. Lenders price that
          risk blind. A month&apos;s rent on an H100 swings like a commodity, and there is nowhere to
          sell it forward.
        </p>
      </Reveal>

      <div className="relative mt-14 grid gap-px border border-hairline bg-hairline md:grid-cols-3">
        <Hallmarks />
        <Fact
          n="01"
          value={59.8}
          format={(v) => `${v.toFixed(1)}%`}
          label="Annualised volatility"
          body="Posted on-demand H100 rates over 78 days, up to 23 providers a day. A commodity-grade swing in the input every AI balance sheet runs on."
        />
        <Fact
          n="02"
          value={6.14}
          format={(v) => `${v.toFixed(2)}×`}
          label="Dearest ÷ cheapest, every day"
          body="The same GPU, the same day, rented at prices six times apart. That is what an absence of price discovery looks like."
        />
        <Fact
          n="03"
          value={43750}
          format={(v) => `$${Math.round(v).toLocaleString()}`}
          label="An unhedged lender's loss"
          body="On one ordinary $175,000 loan if rates settle at $0.80/hr. A quarter of the principal, gone. Hedged, the loss is zero."
        />
      </div>
    </section>
  );
}

function Fact({ n, value, format, label, body }: { n: string; value: number; format: (v: number) => string; label: string; body: string }) {
  return (
    <Reveal className="group relative bg-coal p-7 transition-colors duration-500 hover:bg-ash sm:p-8">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-gold">{n}</span>
        <span className="h-px w-10 bg-hairline transition-all duration-500 group-hover:w-16 group-hover:bg-gold/60" />
      </div>
      <div className="tnum mt-8 font-display text-[clamp(2.8rem,4.6vw,3.8rem)] font-light leading-none tracking-[-0.02em] text-ink">
        <AnimatedNumber value={value} format={format} duration={2} />
      </div>
      <div className="label mt-4 text-gold/80">{label}</div>
      <p className="mt-5 text-[14px] leading-relaxed text-ink-secondary">{body}</p>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// The set piece: eight venues, one price
// ---------------------------------------------------------------------------

export function IndexStage() {
  const ref = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [stage, setStage] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    progress.current = v;
    setStage(v < 0.38 ? 0 : v < 0.7 ? 1 : 2);
  });
  const veil = useTransform(scrollYProgress, [0.9, 1], [0, 1]);

  const venues = useMemo(
    () =>
      [...BASIS]
        .sort((a, b) => a[1] - b[1])
        .map(([name, b]) => ({ name, price: LATEST * (1 + b) })),
    [],
  );

  const captions = [
    { k: "Eight venues.", s: "Each column is what one provider charged for the same H100 on the same day. AWS asked six times what Voltage Park did." },
    { k: "One plane of light.", s: "Ingot's index: a per-provider median, a trimmed mean across providers, signed by a Chainlink DON and published on Monad." },
    { k: "One price.", s: "The number every position, liquidation and settlement on Ingot is marked against." },
  ];

  return (
    <section ref={ref} className="relative mt-32 h-[320vh]">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <PriceColumns venues={venues} index={LATEST} progress={progress} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(9,8,7,0.85))]" />

        <div className="pointer-events-none relative z-10 mx-auto flex h-full max-w-6xl flex-col px-4 pt-24 sm:px-6 sm:pt-28">
          <Label>II — The index</Label>
          <div className="relative mt-4 h-[9rem] max-w-xl sm:h-[11rem]">
            {captions.map((c, i) => (
              <motion.div
                key={c.k}
                className="absolute inset-0"
                initial={false}
                animate={{ opacity: stage === i ? 1 : 0, y: stage === i ? 0 : stage > i ? -18 : 18, filter: stage === i ? "blur(0px)" : "blur(6px)" }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                <h2 className="text-balance font-display text-[clamp(2.2rem,5vw,4.2rem)] font-light leading-[1.02] tracking-[-0.02em]">
                  {i === 2 ? <span className="italic text-molten">{c.k}</span> : c.k}
                </h2>
                <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-ink-secondary">{c.s}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-auto flex justify-center pb-16 sm:justify-end sm:pb-20">
            <motion.div
              initial={false}
              animate={{ opacity: stage === 2 ? 1 : 0, y: stage === 2 ? 0 : 16 }}
              transition={{ duration: 0.6 }}
              className="pointer-events-auto border border-hairline bg-void/70 p-4 backdrop-blur"
            >
              {stage === 2 && <SplitFlap value={`$${LATEST.toFixed(4)}`} label="INGOT H100 INDEX" sequence={providerBoard(LATEST).slice(0, 5)} stepMs={200} size="md" />}
            </motion.div>
          </div>
        </div>
        <motion.div style={{ opacity: veil }} className="pointer-events-none absolute inset-0 bg-void" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The real series
// ---------------------------------------------------------------------------

export function IndexStory() {
  const data = useMemo(
    () => INDEX_SERIES.map(([date, price]) => ({ timestamp: Date.parse(`${date}T12:00:00Z`) / 1000, price })),
    [],
  );
  const prices = INDEX_SERIES.map((row) => row[1]);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);

  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-12 sm:px-6">
      <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
        <div>
          <Reveal>
            <Label>III — 78 days</Label>
          </Reveal>
          <h2 className="text-balance mt-5 font-display text-[clamp(2.2rem,4.8vw,4rem)] font-light leading-[1.04] tracking-[-0.02em]">
            <SplitWords text="Real prices, not a simulation." wordClassName={goldWords("Real", "prices")} />
          </h2>
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-ink-secondary">
              The exact series the backtest replays through the contracts: posted on-demand H100 rates,
              one observation per provider per day, a trimmed mean across them.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.2} className="grid grid-cols-3 border border-hairline">
          {[
            ["Low", `$${lo.toFixed(2)}`],
            ["High", `$${hi.toFixed(2)}`],
            ["Days", "78"],
          ].map(([l, v], i) => (
            <div key={l} className={`px-5 py-4 ${i < 2 ? "border-r border-hairline" : ""}`}>
              <div className="label">{l}</div>
              <div className="tnum mt-1.5 font-mono text-[20px] text-ink">{v}</div>
            </div>
          ))}
        </Reveal>
      </div>

      <Reveal delay={0.1} className="relative mt-10 border border-hairline bg-coal p-4 sm:p-7">
        <Hallmarks />
        <div className="mb-4 flex items-center justify-between">
          <span className="label">
            Ingot H100 index<span className="hidden sm:inline"> · USD per GPU-hour</span>
          </span>
          <span className="label text-gold/70">Series 0001 · 78D</span>
        </div>
        <IndexChart data={data} height={300} width={980} dateOnly />
      </Reveal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

const STEPS = [
  {
    n: "I",
    title: "An index nobody can fake",
    body: "A Chainlink CRE workflow pulls every venue, takes a per-provider median and a trimmed mean, and lands one DON-signed print on chain. A finality delay and tip-only revocation guard every number before money moves on it.",
    tag: "Chainlink CRE",
  },
  {
    n: "II",
    title: "A market in GPU-hours",
    body: "Trade 730 GPU-hour lots, cash-settled to the average index over the delivery window. An underwriter vault quotes every fill, and its inventory skew prices the risk it carries.",
    tag: "Monad",
  },
  {
    n: "III",
    title: "Credit that hedges itself",
    body: "Borrow against offtake revenue and the short opens in the same transaction, sized to your basis. Lender recovery stops depending on where the rate goes.",
    tag: "One transaction",
  },
] as const;

export function HowItWorks() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-36 sm:px-6">
      <Reveal>
        <Label>IV — How it works</Label>
      </Reveal>
      <h2 className="mt-5 max-w-4xl text-balance font-display text-[clamp(2.2rem,4.8vw,4rem)] font-light leading-[1.04] tracking-[-0.02em]">
        <SplitWords text="Three layers. One bar of value." wordClassName={goldWords("One", "bar", "of", "value")} />
      </h2>

      <div className="relative mt-14 grid gap-px border border-hairline bg-hairline md:grid-cols-3">
        <Hallmarks />
        {STEPS.map((step, i) => (
          <Reveal key={step.n} delay={i * 0.1} className="group relative flex flex-col bg-coal p-7 transition-colors duration-500 hover:bg-ash sm:p-8">
            <div className="flex items-start justify-between">
              <span className="font-display text-[56px] font-light italic leading-none text-gold/90">{step.n}</span>
              <span className="border border-hairline px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-secondary">{step.tag}</span>
            </div>
            <h3 className="mt-8 font-display text-[24px] font-light leading-tight text-ink">{step.title}</h3>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-secondary">{step.body}</p>
            {/* Pinned to the card's foot, so the rules line up whatever the copy length. */}
            <div className="mt-auto pt-8">
              <div className="h-px w-full origin-left scale-x-[0.15] bg-gold/60 transition-transform duration-700 group-hover:scale-x-100" />
            </div>
          </Reveal>
        ))}
      </div>
    </section>
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
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <Reveal>
            <Label>VI — The case</Label>
          </Reveal>
          <h2 className="text-balance mt-5 font-display text-[clamp(2.2rem,4.6vw,3.8rem)] font-light leading-[1.04] tracking-[-0.02em]">
            <SplitWords text="Hedged, the lender is whole at every rate." wordClassName={goldWords("whole")} />
          </h2>
          <Reveal delay={0.1}>
            <p className="mt-5 text-[15.5px] leading-relaxed text-ink-secondary">
              A 100,000 GPU-hour monthly offtake financed at 70% LTV: $175,000 lent, $183,750 owed.
              Drag the settlement rate. Every value is what{" "}
              <code className="border border-hairline px-1.5 py-0.5 font-mono text-[12.5px] text-gold">HedgedCredit.project()</code>{" "}
              returns on chain.
            </p>
          </Reveal>

          <Reveal delay={0.2} className="mt-8 grid grid-cols-3 border border-hairline">
            <CaseFigure label="Hedged" value={DEBT} colour={HEDGED} />
            <CaseFigure label="Unhedged" value={unhedged} colour={UNHEDGED} divider />
            <CaseFigure label="Shortfall" value={shortfall} colour={shortfall > 0 ? UNHEDGED : "#867d70"} divider />
          </Reveal>

          <Reveal delay={0.3} className="mt-9">
            <div className="mb-4 flex items-baseline justify-between">
              <span className="label text-ink-secondary">Settlement rate</span>
              <span className="tnum font-mono text-[22px] text-ink">
                ${price.toFixed(2)}
                <span className="text-[12px] text-ink-muted"> / GPU-hr</span>
              </span>
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
            <div className="label mt-3 flex justify-between">
              <span>$0.50</span>
              <span>$3.00</span>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15} className="relative border border-hairline bg-coal p-5 sm:p-7">
          <Hallmarks />
          <RecoveryChart data={points} marker={price} height={360} width={600} />
        </Reveal>
      </div>
    </section>
  );
}

function CaseFigure({ label, value, colour, divider }: { label: string; value: number; colour: string; divider?: boolean }) {
  return (
    <div className={`px-4 py-4 ${divider ? "border-l border-hairline" : ""}`}>
      <div className="label">{label}</div>
      <div className="tnum mt-2 font-mono text-[clamp(1rem,1.9vw,1.35rem)]" style={{ color: colour }}>
        ${Math.round(value).toLocaleString()}
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
    line: "Loan and hedge in one block",
    body: "Sub-second finality is what lets a loan and its hedge open atomically, and lets the mark track the index in real time.",
  },
  {
    name: "Chainlink CRE",
    line: "The index, by DON consensus",
    body: "A workflow that fetches every venue, aggregates by median across nodes, and writes one signed report. No single key can move the price.",
  },
  {
    name: "Envio HyperIndex",
    line: "Both sides of every trade",
    body: "The vault never trades directly, so the indexer derives its book from every other fill, and is proven to the unit against the contracts.",
  },
] as const;

export function BuiltWith() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-36 sm:px-6">
      <Reveal>
        <Label>VII — Built with</Label>
      </Reveal>
      <div className="relative mt-8 grid gap-px border border-hairline bg-hairline md:grid-cols-3">
        <Hallmarks />
        {STACK.map((item, i) => (
          <Reveal key={item.name} delay={i * 0.1} className="group bg-coal p-7 transition-colors duration-500 hover:bg-ash sm:p-8">
            <div className="font-display text-[34px] font-light italic leading-none text-ink transition-colors duration-500 group-hover:text-gold">{item.name}</div>
            <div className="label mt-4 text-gold/80">{item.line}</div>
            <p className="mt-5 text-[14px] leading-relaxed text-ink-secondary">{item.body}</p>
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
    <section className="relative mt-40 overflow-hidden border-t border-hairline">
      <div className="assay absolute inset-0" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse,rgba(232,182,97,0.16),transparent_65%)]" />
      <div className="relative mx-auto max-w-4xl px-4 py-32 text-center sm:px-6">
        <h2 className="text-balance font-display text-[clamp(2.6rem,6.4vw,5.6rem)] font-light leading-[1] tracking-[-0.025em]">
          <SplitWords text="Price the future of compute." wordClassName={goldWords("future")} />
        </h2>
        <Reveal delay={0.2}>
          <p className="mx-auto mt-7 max-w-xl text-[15.5px] leading-relaxed text-ink-secondary">
            Test USDC is one click away. Open a position, draw a hedged loan, or underwrite the book, on
            Monad testnet.
          </p>
        </Reveal>
        <Reveal delay={0.3} className="mt-11 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Magnetic strength={0.18}>
            <Link
              href="/trade"
              className="gloss inline-flex items-center gap-3 border border-gold bg-gold px-7 py-3.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.2em] text-[#140e05] shadow-[0_18px_60px_-18px_rgba(232,182,97,0.9)] hover:bg-gold-soft"
            >
              Start trading →
            </Link>
          </Magnetic>
          <Link
            href="/credit"
            className="inline-flex items-center border border-hairline px-7 py-3.5 font-mono text-[11.5px] uppercase tracking-[0.2em] text-ink-secondary transition-colors hover:border-gold/50 hover:text-ink"
          >
            Draw a hedged loan
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
