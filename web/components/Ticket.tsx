"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { useReadContract } from "wagmi";

import { ingotIndexAbi, ingotMarketAbi } from "@/lib/abis";
import { useDeployment } from "@/lib/useIngot";
import { LOT_HOURS, formatPrice, formatUsdc, parseDecimal } from "@/lib/format";
import { useTx } from "@/lib/tx";
import {
  DEFAULT_SLIPPAGE_BPS,
  SLIPPAGE_OPTIONS,
  formatTolerance,
  maxFill,
  minFill,
} from "@/lib/slippage";
import { Button, Disclosure, Field, Row, Segmented, TextInput } from "./ui";

type Side = "long" | "short";

/// The order ticket. Everything that will be charged is shown before the button: the
/// quoted fill, the notional it implies, the margin it locks up, and the fee. A trader
/// should never have to sign to find out the price.
export function Ticket({
  seriesId,
  mark,
  freeCollateral,
  initialBps,
  takerFeeBps,
  expired = false,
}: {
  seriesId: bigint | undefined;
  mark: bigint | undefined;
  freeCollateral: bigint | undefined;
  initialBps: number | undefined;
  takerFeeBps: number | undefined;
  /// The front contract has stopped trading and next month is not listed yet.
  expired?: boolean;
}) {
  const { deployment } = useDeployment();
  const [side, setSideState] = useState<Side>("long");
  const [lots, setLotsState] = useState("");
  const [toleranceBps, setToleranceBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);

  const parsedLots = parseDecimal(lots, 18);
  const magnitude = parsedLots === null ? null : (parsedLots * LOT_HOURS) / 10n ** 18n;
  const size = magnitude === null ? null : side === "long" ? magnitude : -magnitude;

  const { data: quoted } = useReadContract({
    address: deployment?.market,
    abi: ingotMarketAbi,
    functionName: "quote",
    args: seriesId !== undefined && size !== null && size !== 0n ? [seriesId, size] : undefined,
    query: { enabled: Boolean(deployment) && seriesId !== undefined && size !== null && size !== 0n },
  });

  // A print is public for its finality delay before the mark reads it; while one moves the
  // price past the market's limit, the contract only lets positions shrink.
  const { data: pendingMove } = useReadContract({
    address: deployment?.index,
    abi: ingotIndexAbi,
    functionName: "pendingMoveBps",
    query: { enabled: Boolean(deployment), refetchInterval: 30_000 },
  });
  const { data: pendingLimit } = useReadContract({
    address: deployment?.market,
    abi: ingotMarketAbi,
    functionName: "pendingMoveLimitBps",
    query: { enabled: Boolean(deployment) },
  });
  const indexMoving =
    pendingMove !== undefined && pendingLimit !== undefined && pendingMove > BigInt(pendingLimit);

  const tx = useTx();
  // A new order starts clean: the last fill's confirmation or error belongs to that order.
  const setSide = (next: Side) => {
    if (tx.status === "success" || tx.status === "error") tx.reset();
    setSideState(next);
  };
  const setLots = (next: string) => {
    if (tx.status === "success" || tx.status === "error") tx.reset();
    setLotsState(next);
  };

  const notional =
    quoted && magnitude !== null ? (magnitude * quoted) / 10n ** 30n : undefined;
  const marginRequired =
    notional !== undefined && initialBps !== undefined
      ? (notional * BigInt(initialBps)) / 10_000n
      : undefined;
  const fee =
    notional !== undefined && takerFeeBps !== undefined
      ? (notional * BigInt(takerFeeBps)) / 10_000n
      : undefined;

  const slippage = quoted && mark ? Number(((quoted - mark) * 10_000n) / mark) / 100 : undefined;

  // The bound the contract will enforce, derived from the quote actually shown above.
  const priceLimit =
    quoted === undefined
      ? undefined
      : side === "long"
        ? maxFill(quoted, toleranceBps)
        : minFill(quoted, toleranceBps);
  const insufficient =
    marginRequired !== undefined && freeCollateral !== undefined && marginRequired > freeCollateral;

  const busy = tx.busy;
  const canSubmit =
    Boolean(deployment) &&
    seriesId !== undefined &&
    size !== null &&
    size !== 0n &&
    priceLimit !== undefined &&
    !insufficient &&
    !expired &&
    !busy;

  return (
    <div>
      <div className="relative mb-5 grid grid-cols-2 border border-hairline">
        {(["long", "short"] as const).map((option) => {
          const on = side === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setSide(option)}
              className={`relative px-3 py-3 font-mono text-[11.5px] uppercase tracking-[0.18em] transition-colors duration-300 ${
                on ? (option === "long" ? "text-good" : "text-critical") : "text-ink-muted hover:text-ink-secondary"
              }`}
            >
              {on && (
                <motion.span
                  layoutId="ticket-side"
                  className={`absolute inset-0 ${
                    option === "long"
                      ? "bg-good/[0.1] shadow-[inset_0_-2px_0_rgba(127,209,166,0.9)]"
                      : "bg-critical/[0.1] shadow-[inset_0_-2px_0_rgba(224,104,77,0.9)]"
                  }`}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{option === "long" ? "↗ Long" : "↘ Short"}</span>
            </button>
          );
        })}
      </div>

      <Field label="Size" hint="1 lot = 730 GPU-hours">
        <TextInput
          value={lots}
          onChange={setLots}
          placeholder="0"
          suffix="lots"
          invalid={lots !== "" && parsedLots === null}
        />
      </Field>
      <div className="mt-2 flex gap-1.5">
        {["1", "5", "10", "25"].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setLots(preset)}
            className={`flex-1 border py-1.5 font-mono text-[11px] transition-colors duration-300 ${
              lots === preset
                ? "border-gold/60 bg-gold/10 text-gold"
                : "border-hairline text-ink-muted hover:border-axis hover:text-ink-secondary"
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="mt-5 border-t border-hairline pt-1">
        <Row label="Mark" value={mark === undefined ? "—" : formatPrice(mark)} />
        <Row
          label="Your fill"
          value={quoted === undefined ? "—" : formatPrice(quoted)}
          hint={slippage === undefined ? undefined : `(${slippage > 0 ? "+" : ""}${slippage.toFixed(2)}%)`}
        />
        <Row label="Notional" value={notional === undefined ? "—" : formatUsdc(notional)} />
        <Row
          label="Margin locked"
          value={marginRequired === undefined ? "—" : formatUsdc(marginRequired)}
          tone={insufficient ? "critical" : "default"}
        />
        <Row label="Taker fee" value={fee === undefined ? "—" : formatUsdc(fee)} tone="muted" />
        <Row
          label={side === "long" ? "Max fill accepted" : "Min fill accepted"}
          value={priceLimit === undefined ? "—" : formatPrice(priceLimit)}
          hint="enforced on chain"
          tone="muted"
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-[12.5px] text-ink-secondary">Slippage tolerance</span>
        <Segmented
          options={SLIPPAGE_OPTIONS}
          value={toleranceBps}
          onChange={setToleranceBps}
          render={formatTolerance}
        />
      </div>

      {expired && (
        <p role="status" className="mt-4 border-l-2 border-gold/70 bg-gold/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-ink-secondary">
          <span className="text-gold">This contract has expired.</span> It settles to the window average
          once the index is final through expiry, and the keeper lists next month on its next run.
        </p>
      )}

      {indexMoving && (
        <p role="status" className="mt-4 border-l-2 border-gold/70 bg-gold/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-ink-secondary">
          <span className="text-gold">New index print pending, {(Number(pendingMove) / 100).toFixed(2)}% from the mark.</span>{" "}
          Opening new exposure is paused until it finalizes, within the hour, so nobody trades the old price
          against a move already public. Reducing or closing still works.
        </p>
      )}

      <div className="mt-4">
        <Button
          variant={side === "long" ? "good" : "critical"}
          disabled={!canSubmit}
          onClick={async () => {
            if (!deployment || seriesId === undefined || size === null || priceLimit === undefined) return;
            const receipt = await tx.send(
              {
                address: deployment.market,
                abi: ingotMarketAbi,
                functionName: "trade",
                args: [seriesId, size, priceLimit],
              },
              {
                label: `${side === "long" ? "Long" : "Short"} ${lots} lot${lots === "1" ? "" : "s"}`,
                success: quoted ? `Filled near ${formatPrice(quoted)}` : "Filled",
              },
            );
            if (receipt) setLotsState("");
          }}
        >
          {tx.status === "signing"
            ? "Confirm in wallet…"
            : tx.status === "pending"
              ? "Filling…"
              : insufficient
                ? "Insufficient free collateral"
                : side === "long"
                  ? "Go long"
                  : "Go short"}
        </Button>
      </div>

      {tx.status === "success" && <p className="mt-3 text-center text-[12.5px] text-good">Filled. Your position is live.</p>}
      {tx.status === "error" && <p className="mt-3 break-words text-[12px] text-critical">{tx.error}</p>}

      <Disclosure>
        Your order will not fill worse than the bound above. Positions are marked continuously
        against the index and liquidated when equity falls below the maintenance requirement. A position can lose more than its margin in a fast
        move; the shortfall is absorbed by the underwriter vault. Settlement is the average
        index over the delivery window, not the spot rate on expiry day.
      </Disclosure>
    </div>
  );
}
