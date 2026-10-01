"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

/// Charts in the Molten Glass language: a gradient stroke that glows, light pooled beneath the
/// line, and a draw-in the first time the chart is seen. Interrogable — crosshair and tooltip on
/// hover — because a chart that cannot be questioned is a picture of a chart.

const INK_MUTED = "#7c849f";
const GRID = "rgba(255,255,255,0.05)";
const AXIS = "rgba(255,255,255,0.14)";
export const HEDGED = "#f3c66f";
export const UNHEDGED = "#ff6b81";

const PAD = { top: 16, right: 18, bottom: 28, left: 56 };
const PAD_CAPTIONED = { ...PAD, bottom: 46 };

type Point = { x: number; y: number };

function scale(value: number, from: [number, number], to: [number, number]): number {
  const [d0, d1] = from;
  const [r0, r1] = to;
  if (d1 === d0) return (r0 + r1) / 2;
  return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

/// A smooth path through the points (monotone-ish Catmull-Rom), so the line reads as liquid
/// rather than as a polyline — without overshooting between samples.
function smoothPath(points: Point[]): string {
  if (points.length < 2) return "";
  let d = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    const lo = Math.min(p1.y, p2.y);
    const hi = Math.max(p1.y, p2.y);
    d += ` C${c1x.toFixed(2)} ${Math.min(hi, Math.max(lo, c1y)).toFixed(2)}, ${c2x.toFixed(2)} ${Math.min(hi, Math.max(lo, c2y)).toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

function nearestIndex(points: Point[], x: number) {
  let nearest = 0;
  let best = Infinity;
  points.forEach((p, i) => {
    const distance = Math.abs(p.x - x);
    if (distance < best) {
      best = distance;
      nearest = i;
    }
  });
  return nearest;
}

/// Draw at the container's real width so labels stay legible on a phone instead of being scaled
/// down with the whole drawing. The prop width is what the server renders before measuring.
function useFit(defaultWidth: number, defaultHeight: number) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight });
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w <= 0) return;
      const h = w < 560 ? Math.max(210, Math.round(defaultHeight * 0.82)) : defaultHeight;
      setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [defaultHeight]);
  return { box, ...size };
}

function useDraw() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const prefersReduced = useReducedMotion();
  // Decided after mount, so the server and the first client render agree.
  const [pulse, setPulse] = useState(false);
  useEffect(() => setPulse(!prefersReduced), [prefersReduced]);
  return { ref, drawn: inView || Boolean(prefersReduced), pulse };
}

// ---------------------------------------------------------------------------
// Index history
// ---------------------------------------------------------------------------

export type IndexPoint = { timestamp: number; price: number };

export function IndexChart({
  data,
  height: defaultHeight = 240,
  width: defaultWidth = 720,
  dateOnly = false,
}: {
  data: IndexPoint[];
  height?: number;
  width?: number;
  dateOnly?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const { box, width, height } = useFit(defaultWidth, defaultHeight);
  const [hover, setHover] = useState<number | null>(null);
  const { ref, drawn, pulse } = useDraw();

  const geometry = useMemo(() => {
    if (data.length < 2) return null;
    const xs = data.map((d) => d.timestamp);
    const ys = data.map((d) => d.price);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const padY = (yMax - yMin) * 0.18 || yMax * 0.05;
    const xDomain: [number, number] = [Math.min(...xs), Math.max(...xs)];
    const yDomain: [number, number] = [yMin - padY, yMax + padY];
    const xRange: [number, number] = [PAD.left, width - PAD.right];
    const yRange: [number, number] = [height - PAD.bottom, PAD.top];
    const points = data.map((d) => ({ x: scale(d.timestamp, xDomain, xRange), y: scale(d.price, yDomain, yRange) }));
    const line = smoothPath(points);
    const area = `${line} L${points[points.length - 1].x} ${height - PAD.bottom} L${points[0].x} ${height - PAD.bottom} Z`;
    return { points, line, area, yDomain, yRange };
  }, [data, height, width]);

  if (!geometry) {
    return (
      <div className="flex h-[240px] flex-col items-center justify-center gap-3 text-[13px] text-ink-muted">
        <span className="h-10 w-10 animate-spin-slow rounded-full border border-white/10 border-t-gold/70" />
        Waiting for index prints…
      </div>
    );
  }

  const { points, line, area, yDomain, yRange } = geometry;
  const active = hover === null ? null : data[hover];
  const activePoint = hover === null ? null : points[hover];
  const last = points[points.length - 1];

  return (
    <div ref={box} className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        role="img"
        aria-label="Index rental rate history"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setHover(nearestIndex(points, ((event.clientX - rect.left) / rect.width) * width));
        }}
      >
        <defs>
          <linearGradient id={`stroke-${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#4f8cff" />
            <stop offset="0.55" stopColor="#8b6cff" />
            <stop offset="1" stopColor="#f3c66f" />
          </linearGradient>
          <linearGradient id={`fill-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#8b6cff" stopOpacity="0.32" />
            <stop offset="0.6" stopColor="#4f8cff" stopOpacity="0.06" />
            <stop offset="1" stopColor="#4f8cff" stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${id}`} filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {niceTicks(yDomain[0], yDomain[1], 4).map((tick) => {
          const y = scale(tick, yDomain, yRange);
          return (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 10} y={y + 3.5} textAnchor="end" fontSize={10} fill={INK_MUTED} fontFamily="var(--font-geist-mono)">
                ${tick.toFixed(2)}
              </text>
            </g>
          );
        })}

        <motion.path
          d={area}
          fill={`url(#fill-${id})`}
          initial={{ opacity: 0 }}
          animate={drawn ? { opacity: 1 } : undefined}
          transition={{ duration: 1.6, delay: 0.6 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke={`url(#stroke-${id})`}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#glow-${id})`}
          initial={{ pathLength: 0 }}
          animate={drawn ? { pathLength: 1 } : undefined}
          transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* The latest print, breathing. */}
        <motion.g initial={{ opacity: 0 }} animate={drawn ? { opacity: 1 } : undefined} transition={{ delay: 2 }}>
          <circle cx={last.x} cy={last.y} r={10} fill="#f3c66f" opacity={0.18}>
            {pulse && <animate attributeName="r" values="6;16;6" dur="2.4s" repeatCount="indefinite" />}
            {pulse && <animate attributeName="opacity" values="0.35;0;0.35" dur="2.4s" repeatCount="indefinite" />}
          </circle>
          <circle cx={last.x} cy={last.y} r={4} fill="#ffe3a6" stroke="#03040a" strokeWidth={2} />
        </motion.g>

        {activePoint && (
          <g>
            <line x1={activePoint.x} x2={activePoint.x} y1={PAD.top} y2={height - PAD.bottom} stroke={AXIS} strokeWidth={1} strokeDasharray="2 4" />
            <circle cx={activePoint.x} cy={activePoint.y} r={9} fill="#8b6cff" opacity={0.25} />
            <circle cx={activePoint.x} cy={activePoint.y} r={4.5} fill="#ffffff" stroke="#8b6cff" strokeWidth={2} />
          </g>
        )}
      </svg>

      {active && activePoint && (
        <div
          className="glass pointer-events-none absolute top-0 rounded-xl px-3 py-2 text-[11px]"
          style={{
            left: `${(activePoint.x / width) * 100}%`,
            transform: `translateX(${activePoint.x / width > 0.7 ? "-110%" : "12px"})`,
          }}
        >
          <div className="tnum relative z-[2] font-mono text-[13px] text-ink">${active.price.toFixed(4)}<span className="text-ink-muted">/hr</span></div>
          <div className="relative z-[2] text-ink-muted">
            {new Date(active.timestamp * 1000).toLocaleString(
              undefined,
              dateOnly
                ? { month: "short", day: "numeric", year: "numeric" }
                : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hedged vs unhedged recovery
// ---------------------------------------------------------------------------

export type RecoveryPoint = { price: number; hedged: number; unhedged: number };

/// The comparison the product exists to make. Two series, both direct-labelled and in the
/// legend, so identity is never carried by colour alone. The gap between them is filled: that
/// area is the money an unhedged lender loses.
export function RecoveryChart({
  data,
  marker,
  height: defaultHeight = 300,
  width: defaultWidth = 720,
}: {
  data: RecoveryPoint[];
  marker?: number;
  height?: number;
  width?: number;
}) {
  const id = useId().replace(/:/g, "");
  const { box, width, height } = useFit(defaultWidth, defaultHeight);
  const [hover, setHover] = useState<number | null>(null);
  const { ref, drawn, pulse } = useDraw();
  const pad = PAD_CAPTIONED;

  const geometry = useMemo(() => {
    if (data.length < 2) return null;
    const xs = data.map((d) => d.price);
    const values = data.flatMap((d) => [d.hedged, d.unhedged]);
    const yMax = Math.max(...values);
    const yMin = Math.min(...values);
    const padY = (yMax - yMin) * 0.2 || yMax * 0.1;
    const xDomain: [number, number] = [Math.min(...xs), Math.max(...xs)];
    const yDomain: [number, number] = [Math.max(0, yMin - padY), yMax + padY];
    const xRange: [number, number] = [pad.left, width - pad.right];
    const yRange: [number, number] = [height - pad.bottom, pad.top];
    const project = (key: "hedged" | "unhedged") =>
      data.map((d) => ({ x: scale(d.price, xDomain, xRange), y: scale(d[key], yDomain, yRange) }));
    const hedged = project("hedged");
    const unhedged = project("unhedged");
    const gap =
      `M${hedged.map((p) => `${p.x} ${p.y}`).join(" L")} ` +
      `L${[...unhedged].reverse().map((p) => `${p.x} ${p.y}`).join(" L")} Z`;
    return { hedged, unhedged, gap, xDomain, yDomain, xRange, yRange };
  }, [data, height, width, pad.bottom, pad.left, pad.right, pad.top]);

  if (!geometry) {
    return (
      <div className="flex h-[280px] items-center justify-center text-[13px] text-ink-muted">
        Open a loan to see its recovery profile.
      </div>
    );
  }

  const { hedged, unhedged, gap, xDomain, yDomain, xRange, yRange } = geometry;
  const active = hover === null ? null : data[hover];
  const markerX = marker === undefined ? null : scale(marker, xDomain, xRange);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px]">
        <Legend colour={HEDGED} label="Lender recovery, hedged" />
        <Legend colour={UNHEDGED} label="Lender recovery, unhedged" />
        <span className="flex items-center gap-1.5 text-ink-muted">
          <span className="h-2.5 w-3 rounded-sm bg-critical/25" />
          shortfall the hedge prevents
        </span>
      </div>

      <div ref={box} className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full overflow-visible"
          role="img"
          aria-label="Lender recovery by settlement price, hedged versus unhedged"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setHover(nearestIndex(hedged, ((event.clientX - rect.left) / rect.width) * width));
          }}
        >
          <defs>
            <linearGradient id={`gap-${id}`} x1="0" x2="1">
              <stop offset="0" stopColor={UNHEDGED} stopOpacity="0.32" />
              <stop offset="1" stopColor={UNHEDGED} stopOpacity="0.02" />
            </linearGradient>
            <filter id={`rglow-${id}`} filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {niceTicks(yDomain[0], yDomain[1], 4).map((tick) => {
            const y = scale(tick, yDomain, yRange);
            return (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                <text x={pad.left - 10} y={y + 3.5} textAnchor="end" fontSize={10} fill={INK_MUTED} fontFamily="var(--font-geist-mono)">
                  ${Math.round(tick / 1000)}k
                </text>
              </g>
            );
          })}

          {niceTicks(xDomain[0], xDomain[1], 5).map((tick) => (
            <text key={tick} x={scale(tick, xDomain, xRange)} y={height - pad.bottom + 16} textAnchor="middle" fontSize={10} fill={INK_MUTED} fontFamily="var(--font-geist-mono)">
              ${tick.toFixed(2)}
            </text>
          ))}

          <motion.path
            d={gap}
            fill={`url(#gap-${id})`}
            initial={{ opacity: 0 }}
            animate={drawn ? { opacity: 1 } : undefined}
            transition={{ duration: 1.2, delay: 1.2 }}
          />

          {markerX !== null && (
            <motion.g initial={false} animate={{ x: markerX }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
              <line x1={0} x2={0} y1={pad.top} y2={height - pad.bottom} stroke="rgba(255,255,255,0.35)" strokeWidth={1} strokeDasharray="3 4" />
            </motion.g>
          )}

          <motion.path
            d={smoothPath(unhedged)}
            fill="none"
            stroke={UNHEDGED}
            strokeWidth={2.2}
            strokeLinecap="round"
            filter={`url(#rglow-${id})`}
            initial={{ pathLength: 0 }}
            animate={drawn ? { pathLength: 1 } : undefined}
            transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          />
          <motion.path
            d={smoothPath(hedged)}
            fill="none"
            stroke={HEDGED}
            strokeWidth={2.6}
            strokeLinecap="round"
            filter={`url(#rglow-${id})`}
            initial={{ pathLength: 0 }}
            animate={drawn ? { pathLength: 1 } : undefined}
            transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
          />

          {hover !== null && (
            <g>
              <line x1={hedged[hover].x} x2={hedged[hover].x} y1={pad.top} y2={height - pad.bottom} stroke={AXIS} strokeDasharray="2 4" />
              <circle cx={unhedged[hover].x} cy={unhedged[hover].y} r={4.5} fill="#ffffff" stroke={UNHEDGED} strokeWidth={2} />
              <circle cx={hedged[hover].x} cy={hedged[hover].y} r={4.5} fill="#ffffff" stroke={HEDGED} strokeWidth={2} />
            </g>
          )}

          <text x={width - pad.right} y={hedged[hedged.length - 1].y - 10} textAnchor="end" fontSize={10.5} fill={HEDGED}>
            hedged
          </text>
          <text x={pad.left + 6} y={unhedged[0].y + 18} textAnchor="start" fontSize={10.5} fill={UNHEDGED}>
            unhedged
          </text>
          <text x={pad.left} y={height - 6} fontSize={10} fill={INK_MUTED}>
            settlement rate, USD / GPU-hour
          </text>
        </svg>

        {active && (
          <div className="glass pointer-events-none absolute right-0 top-0 min-w-[190px] rounded-xl px-3 py-2.5 text-[11.5px]">
            <div className="relative z-[2]">
              <div className="tnum mb-1.5 font-mono text-ink-secondary">at ${active.price.toFixed(2)}/hr</div>
              <TooltipRow colour={HEDGED} label="hedged" value={active.hedged} />
              <TooltipRow colour={UNHEDGED} label="unhedged" value={active.unhedged} />
              {active.unhedged < active.hedged && (
                <div className="tnum mt-1.5 border-t border-white/10 pt-1.5 font-mono text-critical">
                  shortfall ${Math.round(active.hedged - active.unhedged).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-ink-secondary">
      <span className="h-[3px] w-4 rounded-full" style={{ background: colour, boxShadow: `0 0 10px ${colour}` }} />
      {label}
    </span>
  );
}

function TooltipRow({ colour, label, value }: { colour: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="h-[3px] w-3 rounded-full" style={{ background: colour }} />
      <span className="text-ink-muted">{label}</span>
      <span className="tnum ml-auto font-mono text-ink">${Math.round(value).toLocaleString()}</span>
    </div>
  );
}
