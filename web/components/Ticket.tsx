"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { ingotMarketAbi } from "@/lib/abis";
import { useDeployment } from "@/lib/useIngot";
import { LOT_HOURS, formatPrice, formatUsdc, parseDecimal } from "@/lib/format";
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
}: {
  seriesId: bigint | undefined;
  mark: bigint | undefined;
  freeCollateral: bigint | undefined;
  initialBps: number | undefined;
  takerFeeBps: number | undefined;
}) {
  const { deployment } = useDeployment();
  const [side, setSide] = useState<Side>("long");
  const [lots, setLots] = useState("");
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

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

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

  const busy = isPending || confirming;
  const canSubmit =
    Boolean(deployment) &&
    seriesId !== undefined &&
    size !== null &&
    size !== 0n &&
    priceLimit !== undefined &&
    !insufficient &&
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

      <div className="mt-4">
        <Button
          variant={side === "long" ? "good" : "critical"}
          disabled={!canSubmit}
          onClick={() =>
            deployment &&
            seriesId !== undefined &&
            size !== null &&
            priceLimit !== undefined &&
            writeContract({
              address: deployment.market,
              abi: ingotMarketAbi,
              functionName: "trade",
              args: [seriesId, size, priceLimit],
            })
          }
        >
          {busy ? "Submitting…" : insufficient ? "Insufficient free collateral" : side === "long" ? "Go long" : "Go short"}
        </Button>
      </div>

      {isSuccess && <p className="mt-3 text-center text-[12.5px] text-good">Filled. Your position is live.</p>}
      {error && (
        <p className="mt-3 break-words text-[12px] text-critical">
          {error.message.split("\n")[0]}
        </p>
      )}

      <Disclosure>
        Your order will not fill worse than the bound above. Positions are marked continuously
        against the index and liquidated when equity falls below the maintenance requirement. A position can lose more than its margin in a fast
        move; the shortfall is absorbed by the underwriter vault. Settlement is the average
        index over the delivery window, not the spot rate on expiry day.
      </Disclosure>
    </div>
  );
}
