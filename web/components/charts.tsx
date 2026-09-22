"use client";

import { useMemo, useState } from "react";

/// Chart chrome, from the validated token set. Series colours are categorical slots 1
/// and 2 on the dark surface; both modes pass the CVD and normal-vision floors.
const INK_MUTED = "#898781";
const GRID = "#2c2c2a";
const AXIS = "#383835";
const SERIES_1 = "#3987e5";
const SERIES_2 = "#d95926";
const SURFACE = "#121211";

const PAD = { top: 12, right: 16, bottom: 26, left: 56 };
/// The recovery chart carries an axis caption under its ticks, so it needs more floor.
const PAD_CAPTIONED = { ...PAD, bottom: 44 };

type Point = { x: number; y: number };

function scale(value: number, from: [number, number], to: [number, number]): number {
  const [d0, d1] = from;
  const [r0, r1] = to;
  if (d1 === d0) return (r0 + r1) / 2;
  return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

function path(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

// ---------------------------------------------------------------------------
// Index history
// ---------------------------------------------------------------------------

export type IndexPoint = { timestamp: number; price: number };

/// One series, so no legend — the card title names it. Crosshair and tooltip on hover,
/// because an HTML chart that cannot be interrogated is a picture of a chart.
export function IndexChart({
  data,
  height = 220,
  width = 720,
}: {
  data: IndexPoint[];
  height?: number;
  width?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (data.length < 2) return null;

    const xs = data.map((d) => d.timestamp);
    const ys = data.map((d) => d.price);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const padY = (yMax - yMin) * 0.15 || yMax * 0.05;

    const xDomain: [number, number] = [Math.min(...xs), Math.max(...xs)];
    const yDomain: [number, number] = [yMin - padY, yMax + padY];
    const xRange: [number, number] = [PAD.left, width - PAD.right];
    const yRange: [number, number] = [height - PAD.bottom, PAD.top];

    const points = data.map((d) => ({
      x: scale(d.timestamp, xDomain, xRange),
      y: scale(d.price, yDomain, yRange),
    }));

    return { points, xDomain, yDomain, xRange, yRange };
  }, [data, height, width]);

  if (!geometry) {
    return (
      <div className="flex h-[220px] items-center justify-center text-[13px] text-ink-muted">
        Waiting for index prints…
      </div>
    );
  }

  const { points, yDomain, yRange } = geometry;
  const active = hover === null ? null : data[hover];
  const activePoint = hover === null ? null : points[hover];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Index rental rate history"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * width;
          let nearest = 0;
          let best = Infinity;
          points.forEach((p, i) => {
            const distance = Math.abs(p.x - x);
            if (distance < best) {
              best = distance;
              nearest = i;
            }
          });
          setHover(nearest);
        }}
      >
        {niceTicks(yDomain[0], yDomain[1], 4).map((tick) => {
          const y = scale(tick, yDomain, yRange);
          return (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill={INK_MUTED}>
                ${tick.toFixed(2)}
              </text>
            </g>
          );
        })}

        <line
          x1={PAD.left}
          x2={width - PAD.right}
          y1={height - PAD.bottom}
          y2={height - PAD.bottom}
          stroke={AXIS}
          strokeWidth={1}
        />

        <path d={path(points)} fill="none" stroke={SERIES_1} strokeWidth={2} strokeLinejoin="round" />

        {activePoint && (
          <g>
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={PAD.top}
              y2={height - PAD.bottom}
              stroke={AXIS}
              strokeWidth={1}
            />
            <circle cx={activePoint.x} cy={activePoint.y} r={4.5} fill={SERIES_1} stroke={SURFACE} strokeWidth={2} />
          </g>
        )}
      </svg>

      {active && (
        <div className="pointer-events-none absolute left-0 top-0 rounded border border-hairline bg-plane/95 px-2 py-1 text-[11px]">
          <div className="tnum text-ink">${active.price.toFixed(4)}/GPU-hr</div>
          <div className="text-ink-muted">
            {new Date(active.timestamp * 1000).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
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

/// The comparison the product exists to make. Two series, so a legend is present and
/// both are direct-labelled — identity is never carried by colour alone.
export function RecoveryChart({
  data,
  marker,
  height = 280,
  width = 720,
}: {
  data: RecoveryPoint[];
  marker?: number;
  height?: number;
  width?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
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

    return {
      hedged: project("hedged"),
      unhedged: project("unhedged"),
      xDomain,
      yDomain,
      xRange,
      yRange,
    };
  }, [data, height, width]);

  if (!geometry) {
    return (
      <div className="flex h-[260px] items-center justify-center text-[13px] text-ink-muted">
        Open a loan to see its recovery profile.
      </div>
    );
  }

  const { hedged, unhedged, xDomain, yDomain, xRange, yRange } = geometry;
  const active = hover === null ? null : data[hover];
  const markerX = marker === undefined ? null : scale(marker, xDomain, xRange);

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[11px]">
        <Legend colour={SERIES_1} label="Hedged recovery" />
        <Legend colour={SERIES_2} label="Unhedged recovery" />
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          role="img"
          aria-label="Lender recovery by settlement price, hedged versus unhedged"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * width;
            let nearest = 0;
            let best = Infinity;
            hedged.forEach((p, i) => {
              const distance = Math.abs(p.x - x);
              if (distance < best) {
                best = distance;
                nearest = i;
              }
            });
            setHover(nearest);
          }}
        >
          {niceTicks(yDomain[0], yDomain[1], 4).map((tick) => {
            const y = scale(tick, yDomain, yRange);
            return (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                <text x={pad.left - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill={INK_MUTED}>
                  ${Math.round(tick / 1000)}k
                </text>
              </g>
            );
          })}

          {niceTicks(xDomain[0], xDomain[1], 5).map((tick) => (
            <text
              key={tick}
              x={scale(tick, xDomain, xRange)}
              y={height - pad.bottom + 14}
              textAnchor="middle"
              fontSize={10}
              fill={INK_MUTED}
            >
              ${tick.toFixed(2)}
            </text>
          ))}

          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={height - pad.bottom}
            y2={height - pad.bottom}
            stroke={AXIS}
            strokeWidth={1}
          />

          {markerX !== null && (
            <line
              x1={markerX}
              x2={markerX}
              y1={pad.top}
              y2={height - pad.bottom}
              stroke={AXIS}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          <path d={path(unhedged)} fill="none" stroke={SERIES_2} strokeWidth={2} strokeLinejoin="round" />
          <path d={path(hedged)} fill="none" stroke={SERIES_1} strokeWidth={2} strokeLinejoin="round" />

          {hover !== null && (
            <g>
              <circle cx={unhedged[hover].x} cy={unhedged[hover].y} r={4.5} fill={SERIES_2} stroke={SURFACE} strokeWidth={2} />
              <circle cx={hedged[hover].x} cy={hedged[hover].y} r={4.5} fill={SERIES_1} stroke={SURFACE} strokeWidth={2} />
            </g>
          )}

          <text x={width - pad.right} y={hedged[hedged.length - 1].y - 8} textAnchor="end" fontSize={10} fill={SERIES_1}>
            hedged
          </text>
          <text x={width - pad.right} y={unhedged[unhedged.length - 1].y + 16} textAnchor="end" fontSize={10} fill={SERIES_2}>
            unhedged
          </text>

          <text x={pad.left} y={height - 6} fontSize={10} fill={INK_MUTED}>
            settlement rate, USD / GPU-hour
          </text>
        </svg>

        {active && (
          <div className="pointer-events-none absolute right-0 top-0 rounded border border-hairline bg-plane/95 px-2 py-1.5 text-[11px]">
            <div className="tnum mb-1 text-ink-secondary">at ${active.price.toFixed(2)}/hr</div>
            <TooltipRow colour={SERIES_1} label="hedged" value={active.hedged} />
            <TooltipRow colour={SERIES_2} label="unhedged" value={active.unhedged} />
            {active.unhedged < active.hedged && (
              <div className="tnum mt-1 border-t border-hairline pt-1 text-critical">
                shortfall ${Math.round(active.hedged - active.unhedged).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-ink-secondary">
      <span className="h-0.5 w-3 rounded-sm" style={{ background: colour }} />
      {label}
    </span>
  );
}

function TooltipRow({ colour, label, value }: { colour: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-0.5 w-3 rounded-sm" style={{ background: colour }} />
      <span className="text-ink-muted">{label}</span>
      <span className="tnum ml-auto text-ink">${Math.round(value).toLocaleString()}</span>
    </div>
  );
}
