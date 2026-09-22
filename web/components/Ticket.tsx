"use client";

import { useState } from "react";
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { maxUint256 } from "viem";

import { ingotMarketAbi } from "@/lib/abis";
import { useDeployment } from "@/lib/useIngot";
import { LOT_HOURS, formatPrice, formatUsdc, parseDecimal } from "@/lib/format";
import { Button, Disclosure, Field, Row, TextInput } from "./ui";

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
  const insufficient =
    marginRequired !== undefined && freeCollateral !== undefined && marginRequired > freeCollateral;

  const busy = isPending || confirming;
  const canSubmit =
    Boolean(deployment) && seriesId !== undefined && size !== null && size !== 0n && !insufficient && !busy;

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded bg-plane p-1">
        {(["long", "short"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSide(option)}
            className={`rounded px-3 py-1.5 text-[13px] font-medium capitalize transition-colors ${
              side === option
                ? option === "long"
                  ? "bg-good/15 text-good ring-1 ring-inset ring-good/40"
                  : "bg-critical/15 text-critical ring-1 ring-inset ring-critical/40"
                : "text-ink-muted hover:text-ink-secondary"
            }`}
          >
            {option}
          </button>
        ))}
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

      <div className="mt-3 border-t border-hairline pt-2">
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
      </div>

      <div className="mt-3">
        <Button
          variant={side === "long" ? "good" : "critical"}
          disabled={!canSubmit}
          onClick={() =>
            deployment &&
            seriesId !== undefined &&
            size !== null &&
            writeContract({
              address: deployment.market,
              abi: ingotMarketAbi,
              functionName: "trade",
              // Price limit is the worst acceptable fill. Open orders use the extremes;
              // a production ticket would let the trader tighten this.
              args: [seriesId, size, side === "long" ? maxUint256 : 0n],
            })
          }
        >
          {busy ? "Submitting…" : insufficient ? "Insufficient free collateral" : `Buy ${side}`}
        </Button>
      </div>

      {isSuccess && <p className="mt-2 text-[12px] text-good">Filled.</p>}
      {error && (
        <p className="mt-2 break-words text-[12px] text-critical">
          {error.message.split("\n")[0]}
        </p>
      )}

      <Disclosure>
        Positions are marked continuously against the index and liquidated when equity falls
        below the maintenance requirement. A position can lose more than its margin in a fast
        move; the shortfall is absorbed by the underwriter vault. Settlement is the average
        index over the delivery window, not the spot rate on expiry day.
      </Disclosure>
    </div>
  );
}
