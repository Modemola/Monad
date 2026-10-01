"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";

/// A split-flap board, the kind that hung over trading floors and departure halls. Each cell
/// flips when its character changes: the old leaf falls away, the new one swings down.
///
/// Given a `sequence`, the board plays through it once when it first comes into view and then
/// settles on `value` — on Ingot, every provider's price for the same H100 flipping past until
/// the board lands on the one number they average to.

type Frame = { label: string; value: string };

export function SplitFlap({
  value,
  label,
  sequence = [],
  stepMs = 260,
  size = "lg",
  className = "",
}: {
  value: string;
  label?: string;
  sequence?: Frame[];
  stepMs?: number;
  size?: "lg" | "md" | "sm";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [frame, setFrame] = useState<Frame>({ label: label ?? "", value });
  const played = useRef(false);

  useEffect(() => {
    if (!inView || played.current) {
      if (played.current) setFrame({ label: label ?? "", value });
      return;
    }
    played.current = true;
    if (sequence.length === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame({ label: label ?? "", value });
      return;
    }
    let i = 0;
    const tick = () => {
      if (i < sequence.length) {
        setFrame(sequence[i]);
        i += 1;
        timer = setTimeout(tick, stepMs);
      } else {
        setFrame({ label: label ?? "", value });
      }
    };
    let timer = setTimeout(tick, 200);
    return () => clearTimeout(timer);
  }, [inView, sequence, stepMs, value, label]);

  const width = Math.max(value.length, ...sequence.map((f) => f.value.length));
  const labelWidth = Math.max((label ?? "").length, ...sequence.map((f) => f.label.length));
  const cell = {
    lg: "h-[54px] w-[38px] text-[34px] sm:h-[68px] sm:w-[48px] sm:text-[44px]",
    md: "h-[42px] w-[30px] text-[26px]",
    sm: "h-[30px] w-[21px] text-[17px]",
  }[size];

  return (
    <div ref={ref} className={`inline-flex flex-col items-center gap-2.5 ${className}`}>
      {labelWidth > 0 && (
        <div className="flex gap-[2px]">
          {frame.label.padEnd(labelWidth, " ").split("").map((ch, i) => (
            <Cell key={i} ch={ch} className="h-[22px] w-[13px] text-[11px] text-ink-secondary" />
          ))}
        </div>
      )}
      <div className="flex gap-[3px]">
        {frame.value.padStart(width, " ").split("").map((ch, i) => (
          <Cell key={i} ch={ch} className={`${cell} text-gold`} />
        ))}
      </div>
    </div>
  );
}

function Cell({ ch, className }: { ch: string; className: string }) {
  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#1d1914_0%,#14110e_49%,#0f0d0a_51%,#16130f_100%)] font-mono leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_0_rgba(0,0,0,0.8)] [perspective:240px] ${className}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={ch}
          className="absolute inset-0 flex items-center justify-center [backface-visibility:hidden]"
          initial={{ rotateX: 92, opacity: 0.2 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{ rotateX: -92, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          style={{ transformOrigin: "50% 50%" }}
        >
          {ch === " " ? " " : ch}
        </motion.span>
      </AnimatePresence>
      {/* The split between the two leaves. */}
      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/80" />
    </span>
  );
}

/// What real providers charged for the same H100 against the index, from docs/BACKTEST.md's
/// basis table, priced off a given index level. The board's warm-up before it lands.
export function providerBoard(index: number): Frame[] {
  const basis: [string, number][] = [
    ["VOLTAGE PARK", -0.453],
    ["AWS", 2.372],
    ["TENSORDOCK", -0.379],
    ["COREWEAVE", 0.692],
    ["RUNPOD", -0.143],
    ["GMI CLOUD", -0.448],
    ["CRUSOE", 0.072],
    ["LAMBDA", 0.001],
  ];
  return basis.map(([name, b]) => ({ label: name, value: `$${(index * (1 + b)).toFixed(4)}` }));
}
