"use client";

import { useReadContract } from "wagmi";

import { ingotMarketAbi } from "@/lib/abis";
import { formatHours, formatLots, formatPrice, formatSignedUsdc, formatUsdc, healthRatio } from "@/lib/format";
import { DEFAULT_SLIPPAGE_BPS, formatTolerance, maxFill, minFill } from "@/lib/slippage";
import { useTx } from "@/lib/tx";
import { useDeployment } from "@/lib/useIngot";
import { Button, Empty, Row } from "./ui";

type Position = { size: bigint; cost: bigint };

/// Price at which this position alone would hit maintenance margin, holding everything else equal.
///
///   equity(P) = equity + size × (P − mark)        maintenance(P) = |size| × P × mm
///
/// Solved for P. A long that is over-collateralised has no liquidation price above zero.
function liquidationPrice(position: Position, mark: bigint, equity: bigint, maintenanceBps: number): number | null {
  const size = Number(position.size) / 1e18;
  const price = Number(mark) / 1e18;
  const cash = Number(equity) / 1e6;
  const mm = maintenanceBps / 10_000;
  if (size > 0) {
    const p = (size * price - cash) / (size * (1 - mm));
    return p > 0 ? p : null;
  }
  const s = -size;
  return (cash + s * price) / (s * (1 + mm));
}

/// The trader's open position in the front contract: what they hold, what it is worth, how far it
/// is from liquidation, and one button to close it at a protected price.
export function PositionPanel({
  seriesId,
  position,
  mark,
  equity,
  maintenanceRequirement,
  maintenanceBps,
  onlyPosition,
}: {
  seriesId: bigint | undefined;
  position: Position | undefined;
  mark: bigint | undefined;
  equity: bigint | undefined;
  maintenanceRequirement: bigint | undefined;
  maintenanceBps: number | undefined;
  /// Whether this is the account's only open position, which the liquidation estimate assumes.
  onlyPosition: boolean;
}) {
  const { deployment } = useDeployment();
  const tx = useTx();
  const open = position !== undefined && position.size !== 0n;
  const closeSize = open ? -position.size : 0n;

  const { data: closeQuote } = useReadContract({
    address: deployment?.market,
    abi: ingotMarketAbi,
    functionName: "quote",
    args: seriesId !== undefined && open ? [seriesId, closeSize] : undefined,
    query: { enabled: Boolean(deployment) && seriesId !== undefined && open },
  });

  if (!open) {
    return <Empty>No open position in the front contract. Open one from the ticket.</Empty>;
  }

  const long = position.size > 0n;
  const unrealized = mark ? (position.size * mark) / 10n ** 30n - position.cost : 0n;
  const absSize = long ? position.size : -position.size;
  const absCost = position.cost < 0n ? -position.cost : position.cost;
  const entry = (absCost * 10n ** 30n) / absSize;
  const health = healthRatio(equity ?? 0n, maintenanceRequirement ?? 0n);
  const liquidation =
    mark !== undefined && equity !== undefined && maintenanceBps !== undefined && onlyPosition
      ? liquidationPrice(position, mark, equity, maintenanceBps)
      : null;
  const closeLimit =
    closeQuote === undefined ? undefined : long ? minFill(closeQuote, DEFAULT_SLIPPAGE_BPS) : maxFill(closeQuote, DEFAULT_SLIPPAGE_BPS);
  const closePnl = closeQuote !== undefined ? (position.size * closeQuote) / 10n ** 30n - position.cost : undefined;

  return (
    <div>
      <div className="grid gap-x-10 sm:grid-cols-2">
        <div>
          <Row label="Side" value={long ? "Long" : "Short"} tone={long ? "good" : "critical"} />
          <Row label="Size" value={`${formatLots(absSize)} lots`} hint={`${formatHours(absSize)} GPU-hrs`} />
          <Row label="Entry" value={formatPrice(entry)} />
          <Row label="Mark" value={mark === undefined ? "—" : formatPrice(mark)} />
        </div>
        <div>
          <Row label="Unrealized" value={formatSignedUsdc(unrealized)} tone={unrealized >= 0n ? "good" : "critical"} />
          <Row label="Equity" value={equity === undefined ? "—" : formatUsdc(equity)} />
          <Row
            label="Health"
            value={health === null ? "—" : `${health.toFixed(2)}×`}
            hint={health !== null && health < 1.2 ? "at risk" : "equity ÷ maintenance"}
            tone={health === null ? "muted" : health < 1 ? "critical" : health < 1.2 ? "default" : "good"}
          />
          <Row
            label="Liquidation"
            value={liquidation === null ? (onlyPosition ? "none" : "—") : `$${liquidation.toFixed(4)}`}
            hint={onlyPosition ? "est., index level" : "cross-margined"}
            tone="muted"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] leading-relaxed text-ink-muted">
          {closeQuote === undefined
            ? "Quoting a close…"
            : `Closing now fills near ${formatPrice(closeQuote)} and realizes ${closePnl === undefined ? "—" : formatSignedUsdc(closePnl)}, within ${formatTolerance(DEFAULT_SLIPPAGE_BPS)}.`}
        </p>
        <div className="sm:w-48">
          <Button
            variant="ghost"
            disabled={!deployment || seriesId === undefined || closeLimit === undefined || tx.busy}
            onClick={() =>
              deployment &&
              seriesId !== undefined &&
              closeLimit !== undefined &&
              tx.send(
                { address: deployment.market, abi: ingotMarketAbi, functionName: "trade", args: [seriesId, closeSize, closeLimit] },
                { label: `Close ${formatLots(absSize)} lot ${long ? "long" : "short"}`, success: "Position closed; PnL realized" },
              )
            }
          >
            {tx.status === "signing" ? "Confirm in wallet…" : tx.status === "pending" ? "Closing…" : "Close position"}
          </Button>
        </div>
      </div>
      {tx.status === "error" && <p className="mt-2 break-words text-[12px] text-critical">{tx.error}</p>}
    </div>
  );
}
