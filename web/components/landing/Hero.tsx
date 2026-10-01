"use client";

import { motion, useScroll, useTransform } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef } from "react";

import { AnimatedNumber, Magnetic, SplitWords } from "@/components/fx/motion";
import { LiveDot } from "@/components/ui";
import { INDEX_SERIES } from "@/lib/story-data";

// Three.js only ever loads on the landing page, and only in the browser.
const IngotScene = dynamic(() => import("@/components/hero/IngotScene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-40 w-40 animate-pulse rounded-full bg-[radial-gradient(circle,rgba(243,198,111,0.35),transparent_70%)] blur-xl" />
    </div>
  ),
});

const LATEST = INDEX_SERIES[INDEX_SERIES.length - 1];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const textY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, 0.86]);

  return (
    <section ref={ref} className="relative min-h-[100svh] overflow-hidden">
      {/* The scene sits in the right half on a desktop and above the copy on a phone. */}
      <motion.div
        style={{ scale: sceneScale }}
        className="absolute inset-x-0 top-[72px] h-[46svh] sm:top-0 sm:h-full lg:left-[48%]"
      >
        <IngotScene />
      </motion.div>

      <motion.div
        style={{ y: textY, opacity: textOpacity }}
        className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-4 pb-14 pt-[50svh] sm:px-6 sm:pt-32 lg:justify-center lg:pb-24"
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="glass mb-6 inline-flex w-fit items-center gap-2.5 rounded-full py-1.5 pl-3 pr-4"
        >
          <span className="relative z-[2] flex items-center gap-2.5">
            <LiveDot tone="gold" />
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-secondary">
              GPU compute, as a market<span className="hidden sm:inline"> · on Monad</span>
            </span>
          </span>
        </motion.div>

        <h1 className="max-w-[13ch] font-display text-[clamp(3.4rem,8.4vw,7.4rem)] leading-[0.92] tracking-[-0.02em]">
          <SplitWords text="Compute," className="block" delay={0.35} wordClassName={() => "text-chrome"} />
          <SplitWords
            text="priced & hedged."
            className="block"
            delay={0.55}
            wordClassName={(word) => (word === "priced" || word === "hedged." ? "italic text-molten" : "text-chrome")}
          />
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1, delay: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-7 max-w-[34rem] text-[clamp(1rem,1.4vw,1.15rem)] leading-relaxed text-ink-secondary"
        >
          The rate a GPU rents for is the most important number in AI infrastructure, and nobody can
          hedge it. Ingot is a cash-settled market for that rate, and the credit layer it unlocks:
          loans whose hedge opens in the same transaction.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.35, ease: [0.22, 1, 0.36, 1] }}
          className="mt-9 flex flex-wrap items-center gap-3"
        >
          <Magnetic>
            <Link
              href="/trade"
              className="gloss group relative inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-gold-soft via-gold to-gold-deep px-7 py-3.5 text-[15px] font-semibold text-[#1d1203] shadow-[0_18px_50px_-14px_rgba(243,198,111,0.9),inset_0_1px_0_rgba(255,255,255,0.75)] transition-shadow duration-500 hover:shadow-[0_22px_70px_-10px_rgba(243,198,111,1),inset_0_1px_0_rgba(255,255,255,0.75)]"
            >
              Open the terminal
              <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
            </Link>
          </Magnetic>
          <Magnetic strength={0.2}>
            <a
              href="#thesis"
              className="gloss inline-flex items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.05] px-6 py-3.5 text-[15px] font-medium text-ink backdrop-blur-xl transition-colors duration-300 hover:border-white/[0.28] hover:bg-white/[0.09]"
            >
              Why it matters
            </a>
          </Magnetic>
        </motion.div>

        <motion.dl
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.12, delayChildren: 1.6 } } }}
          className="mt-12 grid max-w-2xl grid-cols-3 gap-2 sm:gap-3"
        >
          <HeroFigure label="H100 index" detail="USD / GPU-hour">
            <AnimatedNumber value={LATEST[1]} format={(n) => `$${n.toFixed(2)}`} />
          </HeroFigure>
          <HeroFigure label="Volatility" detail="annualised">
            <AnimatedNumber value={59.8} format={(n) => `${n.toFixed(1)}%`} />
          </HeroFigure>
          <HeroFigure label="Price spread" detail="dearest ÷ cheapest">
            <AnimatedNumber value={6.14} format={(n) => `${n.toFixed(2)}×`} />
          </HeroFigure>
        </motion.dl>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.4 }}
        className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 lg:flex"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">scroll</span>
        <span className="relative h-10 w-px overflow-hidden bg-white/10">
          <motion.span
            className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-transparent to-gold"
            animate={{ y: [-16, 40] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </span>
      </motion.div>
    </section>
  );
}

function HeroFigure({ label, detail, children }: { label: string; detail: string; children: React.ReactNode }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 14, filter: "blur(6px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)" } }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="glass rounded-2xl px-3.5 py-3 sm:px-4"
    >
      <div className="relative z-[2]">
        <dt className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-muted sm:text-[10px]">{label}</dt>
        <dd className="tnum mt-1.5 text-[19px] font-semibold tracking-tight text-chrome sm:text-[24px]">{children}</dd>
        <div className="mt-0.5 text-[10.5px] text-ink-muted sm:text-[11px]">{detail}</div>
      </div>
    </motion.div>
  );
}
