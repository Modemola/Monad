"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";

import { Reveal, SplitWords } from "@/components/fx/motion";
import { Hallmarks } from "@/components/ui";

/// What `HedgedCredit.open()` does before the transaction ends, drawn as a sequence diagram: four
/// parties, four messages, one transaction. If any step fails, none of them happened — which is
/// the whole claim, so it is worth showing rather than saying. The figures are the same worked
/// example "The case" uses below: 100,000 GPU-hours at a $2.50 forward, 70% advance, $60,000 margin.

const LANES = [
  { name: "Borrower", sub: "a neocloud with offtake" },
  { name: "HedgedCredit", sub: "lender pool" },
  { name: "IngotMarket", sub: "margin engine" },
  { name: "Underwriter vault", sub: "takes the other side" },
] as const;

type Message = { from: number; to: number; call: string; note: string };

const MESSAGES: Message[] = [
  { from: 0, to: 1, call: "open(100,000 GPU-hrs, $60,000 margin)", note: "margin posted" },
  { from: 1, to: 2, call: "trade(−100,000 GPU-hrs, ≥ min fill)", note: "short at the forward, $2.50" },
  { from: 2, to: 3, call: "fill against the vault", note: "vault takes the long, quoted off the mark" },
  { from: 1, to: 0, call: "transfer $175,000", note: "principal: 70% of hedged revenue" },
];

const W = 1000;
const ROW = 92;
const TOP = 26;
const H = TOP + ROW * MESSAGES.length + 18;
const laneX = (i: number) => 125 + i * 250;
const STEP = 0.95; // seconds between messages

export function OneTransaction() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-120px" });
  const reduced = useReducedMotion();
  const [run, setRun] = useState(0);
  const play = inView || Boolean(reduced);

  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-36 sm:px-6">
      <Reveal>
        <div className="eyebrow">V — One transaction</div>
      </Reveal>
      <h2 className="mt-5 max-w-4xl text-balance font-display text-[clamp(2.2rem,4.8vw,4rem)] font-light leading-[1.04] tracking-[-0.02em]">
        <SplitWords
          text="A loan and its hedge, in the same block."
          wordClassName={(word) => (["same", "block."].includes(word) ? "italic text-molten" : "text-ink")}
        />
      </h2>
      <Reveal delay={0.1}>
        <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-ink-secondary">
          One call does four things before the transaction ends. If any of them fails — the hedge
          fills outside the borrower&apos;s bound, the vault is at capacity, the pool is short of cash —
          the whole call reverts and none of them happened. There is no moment where the loan exists
          and the hedge does not.
        </p>
      </Reveal>

      <Reveal delay={0.15} className="relative mt-12 border border-hairline bg-coal">
        <Hallmarks />
        <div ref={ref} className="relative px-3 pb-6 pt-6 sm:px-6">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="label">
              HedgedCredit.open()<span className="hidden sm:inline"> · one transaction</span>
            </span>
            <button
              type="button"
              onClick={() => setRun((n) => n + 1)}
              className="label text-gold/70 transition-colors hover:text-gold"
            >
              Replay ↺
            </button>
          </div>

          {/* Desktop and tablet: the sequence diagram. */}
          <div className="hidden md:block">
            <div className="grid grid-cols-4">
              {LANES.map((lane) => (
                <div key={lane.name} className="px-2 py-4 text-center">
                  <div className="font-display text-[19px] font-light text-ink">{lane.name}</div>
                  <div className="label mt-1">{lane.sub}</div>
                </div>
              ))}
            </div>
            <svg key={run} viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label="Sequence of the four steps inside one HedgedCredit.open transaction">
              <defs>
                <marker id="ot-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill="#e8b661" />
                </marker>
                <linearGradient id="ot-tx" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#e8b661" stopOpacity="0.14" />
                  <stop offset="1" stopColor="#e8b661" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* The transaction boundary: everything inside it lands, or none of it does. */}
              <motion.rect
                x={14}
                y={TOP - 14}
                width={W - 28}
                height={ROW * MESSAGES.length + 10}
                fill="url(#ot-tx)"
                stroke="#e8b661"
                strokeOpacity={0.35}
                strokeDasharray="5 6"
                initial={{ opacity: 0 }}
                animate={play ? { opacity: 1 } : undefined}
                transition={{ duration: 0.8 }}
              />

              {LANES.map((lane, i) => (
                <line key={lane.name} x1={laneX(i)} x2={laneX(i)} y1={0} y2={H} stroke="rgba(243,236,223,0.12)" strokeDasharray="2 6" />
              ))}

              {MESSAGES.map((message, i) => {
                const y = TOP + ROW * i + ROW / 2;
                const x1 = laneX(message.from);
                const x2 = laneX(message.to);
                const delay = reduced ? 0 : 0.5 + i * STEP;
                const mid = (x1 + x2) / 2;
                return (
                  <g key={message.call}>
                    <motion.circle
                      cx={x1}
                      cy={y}
                      r={5}
                      fill="#e8b661"
                      initial={{ opacity: 0 }}
                      animate={play ? { opacity: 1 } : undefined}
                      transition={{ delay, duration: 0.2 }}
                    />
                    <motion.line
                      x1={x1}
                      y1={y}
                      x2={x2 + (x2 > x1 ? -6 : 6)}
                      y2={y}
                      stroke="#e8b661"
                      strokeWidth={1.6}
                      markerEnd="url(#ot-head)"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={play ? { pathLength: 1, opacity: 1 } : undefined}
                      transition={{ delay, duration: reduced ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
                    />
                    {!reduced && (
                      <motion.circle
                        cy={y}
                        r={3.5}
                        fill="#fff4dc"
                        initial={{ cx: x1, opacity: 0 }}
                        animate={play ? { cx: [x1, x2], opacity: [0, 1, 1, 0] } : undefined}
                        transition={{ delay, duration: 0.6, ease: "easeInOut" }}
                        style={{ filter: "drop-shadow(0 0 6px rgba(246,220,166,0.9))" }}
                      />
                    )}
                    <motion.g
                      initial={{ opacity: 0, y: 6 }}
                      animate={play ? { opacity: 1, y: 0 } : undefined}
                      transition={{ delay: delay + 0.25, duration: 0.5 }}
                    >
                      <text x={mid} y={y - 12} textAnchor="middle" fontSize={14} fill="#f3ecdf" fontFamily="var(--font-geist-mono)">
                        {message.call}
                      </text>
                      <text x={mid} y={y + 24} textAnchor="middle" fontSize={13} fill="#c4baa9">
                        {message.note}
                      </text>
                      <text x={Math.min(x1, x2) + 8} y={y - 30} fontSize={11} fill="#e8b661" fontFamily="var(--font-geist-mono)" letterSpacing={2}>
                        {String(i + 1).padStart(2, "0")}
                      </text>
                    </motion.g>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Phones: the same four steps as a numbered list. */}
          <ol key={`list-${run}`} className="space-y-3 md:hidden">
            {MESSAGES.map((message, i) => (
              <motion.li
                key={message.call}
                initial={{ opacity: 0, x: -10 }}
                animate={play ? { opacity: 1, x: 0 } : undefined}
                transition={{ delay: reduced ? 0 : 0.3 + i * 0.5, duration: 0.5 }}
                className="border-l border-gold/40 py-1 pl-4"
              >
                <div className="label text-gold/80">
                  {String(i + 1).padStart(2, "0")} · {LANES[message.from].name} → {LANES[message.to].name}
                </div>
                <div className="mt-1.5 break-words font-mono text-[12.5px] text-ink">{message.call}</div>
                <div className="mt-1 text-[12.5px] text-ink-secondary">{message.note}</div>
              </motion.li>
            ))}
          </ol>

          <motion.div
            key={`seal-${run}`}
            initial={{ opacity: 0, y: 8 }}
            animate={play ? { opacity: 1, y: 0 } : undefined}
            transition={{ delay: reduced ? 0 : 0.6 + MESSAGES.length * STEP, duration: 0.6 }}
            className="mt-5 flex flex-col gap-2 border-t border-hairline px-1 pt-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-[13.5px] text-ink-secondary">
              Lender recovery is now <span className="text-gold">$183,750</span> — the full debt — at every
              settlement rate.
            </span>
            <span className="label">All four, or none</span>
          </motion.div>
        </div>
      </Reveal>
    </section>
  );
}
