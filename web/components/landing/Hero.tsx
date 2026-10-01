"use client";

import { motion, useScroll, useTransform } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef } from "react";

import { Magnetic, SplitWords } from "@/components/fx/motion";
import { Scene } from "@/components/fx/Scene";
import { SplitFlap, providerBoard } from "@/components/fx/SplitFlap";
import { GoldFallback } from "@/components/hero/Fallbacks";
import { INDEX_SERIES } from "@/lib/story-data";

// Three.js only ever loads on the landing page, and only in the browser.
const GoldScene = dynamic(() => import("@/components/hero/GoldScene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-x-0 bottom-[12%] flex justify-center">
      <div className="h-24 w-72 animate-pulse bg-[radial-gradient(ellipse,rgba(232,182,97,0.3),transparent_70%)] blur-xl" />
    </div>
  ),
});

const LATEST = INDEX_SERIES[INDEX_SERIES.length - 1][1];
const BOARD = providerBoard(LATEST);

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const textY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-[132svh] overflow-hidden">
      {/* The bar has its own stage below the copy, fading in at the top so the light never shows an edge. */}
      <div className="absolute inset-x-0 bottom-0 top-[60%] [mask-image:linear-gradient(to_bottom,transparent,#000_18%,#000_82%,transparent)]">
        <Scene fallback={<GoldFallback />}>
          <GoldScene />
        </Scene>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_50%_45%,transparent_40%,#090807)]" />
      </div>

      <motion.div
        style={{ y: textY, opacity: textOpacity }}
        className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-4 pt-32 text-center sm:px-6 sm:pt-36 [@media(max-height:820px)]:sm:pt-28"
      >
        <span
          style={{ animationDelay: "0.2s" }}
          className="rise inline-flex items-center gap-2.5 border border-gold/40 bg-void/60 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.22em] text-gold backdrop-blur"
        >
          <span className="h-1.5 w-1.5 bg-gold" />
          GPU compute, as a market<span className="hidden sm:inline">&nbsp;· on Monad</span>
        </span>

        <h1 className="mt-7 font-display text-[clamp(3rem,min(7.4vw,11svh),6.8rem)] [@media(max-height:820px)]:mt-5 font-light leading-[0.98] tracking-[-0.025em]">
          <SplitWords onLoad text="Compute," className="block" delay={0.3} wordClassName={() => "text-ink"} />
          <SplitWords
            onLoad
            text="priced & hedged."
            className="block"
            delay={0.48}
            wordClassName={(word) => (word === "&" ? "text-ink" : "italic text-molten")}
          />
        </h1>

        <p
          style={{ animationDelay: "0.7s" }}
          className="rise mt-6 max-w-[36rem] [@media(max-height:820px)]:mt-4 text-[15.5px] leading-relaxed text-ink-secondary sm:text-[17px]"
        >
          The rate a GPU rents for is the most important number in AI infrastructure, and nobody can
          hedge it. Ingot is a cash-settled market for that rate, and loans whose hedge opens in the
          same transaction.
        </p>

        <div style={{ animationDelay: "0.9s" }} className="rise mt-8 [@media(max-height:820px)]:mt-6">
          <SplitFlap value={`$${LATEST.toFixed(4)}`} label="INGOT H100 INDEX" sequence={BOARD} size="md" />
          <div className="label mt-2.5">USD per GPU-hour · eight venues flip, one price lands</div>
        </div>

        <div
          style={{ animationDelay: "1.1s" }}
          className="rise mt-9 flex flex-col items-center gap-3 sm:flex-row [@media(max-height:820px)]:mt-7"
        >
          <Magnetic strength={0.18}>
            <Link
              href="/trade"
              className="gloss group inline-flex items-center gap-3 border border-gold bg-gold px-7 py-3.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.2em] text-[#140e05] shadow-[0_18px_60px_-18px_rgba(232,182,97,0.9)] transition-colors hover:bg-gold-soft"
            >
              Open the terminal
              <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
            </Link>
          </Magnetic>
          <a
            href="#thesis"
            className="inline-flex items-center border border-hairline bg-void/50 px-7 py-3.5 font-mono text-[11.5px] uppercase tracking-[0.2em] text-ink-secondary backdrop-blur transition-colors hover:border-gold/50 hover:text-ink"
          >
            Why it matters
          </a>
        </div>
      </motion.div>
    </section>
  );
}
