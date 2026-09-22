"use client";

import { useMemo, useState } from "react";
import { useReadContracts } from "wagmi";

import { hedgedCreditAbi } from "@/lib/abis";
import { useDeployment } from "@/lib/useIngot";
import { formatPrice, formatSignedUsdc, formatUsdc } from "@/lib/format";
import { RecoveryChart, type RecoveryPoint } from "./charts";
import { Row } from "./ui";

const SAMPLES = 21;

/// Reads the recovery curve out of the contract rather than recomputing the formula in
/// the browser. `recoveryHedged` is piecewise linear in the settlement rate, so 21 points
/// describe it exactly — and every point on the chart is a value the chain returned.
export function RecoveryPanel({
  loanId,
  hedgeEntryPrice,
  debt,
  currentPrice,
}: {
  loanId: bigint;
  hedgeEntryPrice: bigint;
  debt: bigint;
  currentPrice?: bigint;
}) {
  const { deployment } = useDeployment();

  const prices = useMemo(() => {
    const low = (hedgeEntryPrice * 30n) / 100n;
    const high = (hedgeEntryPrice * 250n) / 100n;
    const step = (high - low) / BigInt(SAMPLES - 1);
    return Array.from({ length: SAMPLES }, (_, i) => low + step * BigInt(i));
  }, [hedgeEntryPrice]);

  // Open on today's rate rather than an arbitrary midpoint: the honest starting question
  // is "where are we now", and the worst case is stated above the chart regardless.
  const defaultIndex = useMemo(() => {
    if (currentPrice === undefined) return Math.floor(SAMPLES / 2);
    let nearest = 0;
    let best = prices[0] > currentPrice ? prices[0] - currentPrice : currentPrice - prices[0];
    prices.forEach((price, i) => {
      const distance = price > currentPrice ? price - currentPrice : currentPrice - price;
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    return nearest;
  }, [currentPrice, prices]);

  const [index, setIndex] = useState<number | null>(null);
  const active = index ?? defaultIndex;

  const { data } = useReadContracts({
    contracts: deployment
      ? prices.map((price) => ({
          address: deployment.hedgedCredit,
          abi: hedgedCreditAbi,
          functionName: "project" as const,
          args: [loanId, price] as const,
        }))
      : [],
    query: { enabled: Boolean(deployment) },
  });

  const points: RecoveryPoint[] = useMemo(() => {
    if (!data) return [];
    return data
      .map((entry, i) => {
        const result = entry.result as readonly [bigint, bigint, bigint, bigint, bigint] | undefined;
        if (!result) return null;
        return {
          price: Number(prices[i]) / 1e18,
          hedged: Number(result[3]) / 1e6,
          unhedged: Number(result[4]) / 1e6,
        };
      })
      .filter((p): p is RecoveryPoint => p !== null);
  }, [data, prices]);

  const selected = data?.[active]?.result as
    | readonly [bigint, bigint, bigint, bigint, bigint]
    | undefined;
  const selectedPrice = prices[active];
  const shortfall = selected ? selected[3] - selected[4] : 0n;

  /// The headline: the largest gap between the two curves anywhere on the displayed range.
  /// Stated up front so the point lands without anyone having to drag the slider.
  const worst = useMemo(() => {
    let found: { price: number; gap: number } | null = null;
    for (const point of points) {
      const gap = point.hedged - point.unhedged;
      if (gap > 0 && (!found || gap > found.gap)) found = { price: point.price, gap };
    }
    return found;
  }, [points]);

  return (
    <div className="space-y-4">
      {worst && (
        <p className="rounded border border-critical/30 bg-critical/5 px-3 py-2 text-[12px] leading-relaxed text-ink-secondary">
          If the rate settles at{" "}
          <span className="tnum text-ink">${worst.price.toFixed(2)}</span>/GPU-hour, an unhedged
          lender on this loan recovers{" "}
          <span className="tnum text-critical">
            ${Math.round(worst.gap).toLocaleString()} less
          </span>{" "}
          than the debt. Hedged, they are made whole at every rate on this chart.
        </p>
      )}

      <RecoveryChart data={points} marker={Number(selectedPrice) / 1e18} />

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[12px] text-ink-secondary">
            If the contract settles at{" "}
            <span className="tnum text-ink">{formatPrice(selectedPrice)}</span> / GPU-hour
          </span>
          <span className="text-[11px] text-ink-muted">drag to explore</span>
        </div>
        <input
          type="range"
          min={0}
          max={SAMPLES - 1}
          value={active}
          onChange={(event) => setIndex(Number(event.target.value))}
          className="w-full"
          aria-label="Settlement rate"
        />
      </div>

      <div className="grid gap-x-8 sm:grid-cols-2">
        <div>
          <Row label="Debt at maturity" value={formatUsdc(debt)} />
          <Row
            label="Hedge PnL"
            value={selected ? formatSignedUsdc(selected[0]) : "—"}
            tone={selected && selected[0] >= 0n ? "good" : "critical"}
          />
          <Row
            label="Borrower resources"
            value={selected ? formatUsdc(selected[1]) : "—"}
            hint="offtake + hedge"
          />
        </div>
        <div>
          <Row
            label="Lender recovery, hedged"
            value={selected ? formatUsdc(selected[3]) : "—"}
            tone="good"
          />
          <Row
            label="Lender recovery, unhedged"
            value={selected ? formatUsdc(selected[4]) : "—"}
            tone={shortfall > 0n ? "critical" : "default"}
          />
          <Row
            label="Shortfall avoided"
            value={shortfall > 0n ? formatUsdc(shortfall) : "—"}
            tone={shortfall > 0n ? "critical" : "muted"}
          />
        </div>
      </div>
    </div>
  );
}
