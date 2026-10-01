"use client";

import { motion } from "motion/react";

import { IngotMark } from "@/components/Nav";

/// The hero without WebGL: the gold mark, lit, over its own reflection.
export function GoldFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-[34rem] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse,rgba(232,182,97,0.32),transparent_68%)] blur-2xl" />
      <motion.div
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex flex-col items-center"
      >
        <IngotMark size={220} className="drop-shadow-[0_30px_60px_rgba(232,182,97,0.35)]" />
        <div className="-mt-10 scale-y-[-1] opacity-20 [mask-image:linear-gradient(to_top,#000,transparent_70%)]">
          <IngotMark size={220} />
        </div>
      </motion.div>
    </div>
  );
}

type Venue = { name: string; price: number };

/// The eight-venue set piece without WebGL: the same columns and the same index line, drawn flat.
export function ColumnsFallback({ venues, index }: { venues: Venue[]; index: number }) {
  const top = Math.max(...venues.map((venue) => venue.price));
  const width = 900;
  const height = 420;
  const base = height - 50;
  const scale = (base - 40) / top;
  const slot = width / venues.length;
  const bar = slot * 0.5;
  const indexY = base - index * scale;

  return (
    <div className="absolute inset-x-0 bottom-[8%] flex justify-center px-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-4xl overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="fallback-column" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6dca6" />
            <stop offset="0.3" stopColor="#e8b661" />
            <stop offset="1" stopColor="#5a3c14" />
          </linearGradient>
        </defs>
        <line x1={0} y1={base} x2={width} y2={base} stroke="rgba(243,236,223,0.14)" />
        {venues.map((venue, i) => {
          const h = venue.price * scale;
          const x = i * slot + (slot - bar) / 2;
          return (
            <g key={venue.name}>
              <motion.rect
                x={x}
                width={bar}
                fill="url(#fallback-column)"
                initial={{ y: base, height: 0 }}
                whileInView={{ y: base - h, height: h }}
                viewport={{ once: true }}
                transition={{ duration: 1.1, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              />
              <text x={x + bar / 2} y={base - h - 10} textAnchor="middle" fontSize={14} fill="#f3ecdf" fontFamily="var(--font-geist-mono)">
                ${venue.price.toFixed(2)}
              </text>
              <text x={x + bar / 2} y={base + 22} textAnchor="middle" fontSize={10} letterSpacing={1.5} fill="#867d70" fontFamily="var(--font-geist-mono)">
                {venue.name.toUpperCase()}
              </text>
            </g>
          );
        })}
        <motion.line
          x1={-20}
          x2={width + 20}
          y1={indexY}
          y2={indexY}
          stroke="#ffd38a"
          strokeWidth={1.5}
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, delay: 0.9 }}
        />
        <text x={0} y={indexY - 10} fontSize={12} letterSpacing={2.5} fill="#e8b661" fontFamily="var(--font-geist-mono)">
          INDEX ${index.toFixed(4)}
        </text>
      </svg>
    </div>
  );
}
