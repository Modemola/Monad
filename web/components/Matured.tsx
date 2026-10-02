"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";

import { ingotIndexAbi, ingotMarketAbi } from "@/lib/abis";
import { formatLots, formatPrice, formatSignedUsdc } from "@/lib/format";
import { useTx } from "@/lib/tx";
import { useDeployment, type Series } from "@/lib/useIngot";

type Position = { size: bigint; cost: bigint };

const fmtDate = (seconds: bigint) =>
  new Date(Number(seconds) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/// Positions the account still holds in contracts other than the front month — in practice, last
/// month's, after the roll. A settled contract pays out only when the position is realized into
/// the account's cash; until then the profit backs margin but cannot be withdrawn. Settlement and
/// realization are both permissionless, so the trader never has to wait on the keeper.
export function MaturedPositions({ frontId, openSeries }: { frontId: bigint | undefined; openSeries: readonly bigint[] | undefined }) {
  const { address } = useAccount();
  const { deployment, chainId } = useDeployment();
  const ids = (openSeries ?? []).filter((id) => id !== frontId);
  const enabled = Boolean(deployment && address) && ids.length > 0;

  const { data } = useReadContracts({
    contracts: enabled
      ? ids.flatMap((id) => [
          { chainId, address: deployment!.market, abi: ingotMarketAbi, functionName: "seriesAt" as const, args: [id] as const },
          {
            chainId,
            address: deployment!.market,
            abi: ingotMarketAbi,
            functionName: "positionOf" as const,
            args: [address!, id] as const,
          },
        ])
      : [],
    query: { enabled },
  });

  const { data: finalizedThrough } = useReadContract({
    address: deployment?.index,
    abi: ingotIndexAbi,
    functionName: "finalizedThrough",
    chainId,
    query: { enabled },
  });

  if (!enabled) return null;
  const rows = ids
    .map((id, i) => ({
      id,
      series: data?.[2 * i]?.result as Series | undefined,
      position: data?.[2 * i + 1]?.result as Position | undefined,
    }))
    .filter((row) => row.series && row.position && row.position.size !== 0n);
  if (rows.length === 0) return null;

  return (
    <div className="mt-6 border-t border-hairline pt-5">
      <div className="label mb-3">Earlier contracts</div>
      <ul className="space-y-2.5">
        {rows.map(({ id, series, position }) => (
          <MaturedRow key={id.toString()} id={id} series={series!} position={position!} finalizedThrough={finalizedThrough} />
        ))}
      </ul>
    </div>
  );
}

function MaturedRow({
  id,
  series,
  position,
  finalizedThrough,
}: {
  id: bigint;
  series: Series;
  position: Position;
  finalizedThrough: bigint | undefined;
}) {
  const { address } = useAccount();
  const { deployment } = useDeployment();
  const tx = useTx();

  const long = position.size > 0n;
  const absSize = long ? position.size : -position.size;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const expired = series.expiry <= now;
  const settleable = expired && !series.settled && finalizedThrough !== undefined && finalizedThrough >= series.expiry;
  const pnl = series.settled ? (position.size * series.settlementPrice) / 10n ** 30n - position.cost : undefined;

  const status = series.settled
    ? `Settled at ${formatPrice(series.settlementPrice)} · ${formatSignedUsdc(pnl!)}`
    : settleable
      ? "Expired · ready to settle"
      : expired
        ? "Expired · awaiting the final print"
        : `Trading · expires ${fmtDate(series.expiry)}`;

  const action = series.settled
    ? {
        label: "Realize",
        busy: "Realizing…",
        call: () =>
          tx.send(
            { address: deployment!.market, abi: ingotMarketAbi, functionName: "settlePosition", args: [address!, id] },
            { label: `Realize series #${id.toString()}`, success: "PnL realized into your cash balance" },
          ),
      }
    : settleable
      ? {
          label: "Settle",
          busy: "Settling…",
          call: () =>
            tx.send(
              { address: deployment!.market, abi: ingotMarketAbi, functionName: "settleSeries", args: [id] },
              { label: `Settle series #${id.toString()}`, success: "Contract settled; realize your position next" },
            ),
        }
      : undefined;

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border border-hairline bg-coal/60 px-3.5 py-3">
      <div className="min-w-0">
        <div className="text-[13px] text-ink">
          <span className={long ? "text-good" : "text-critical"}>{long ? "Long" : "Short"}</span> {formatLots(absSize)} lots
          <span className="text-ink-muted"> · {fmtDate(series.windowStart)}–{fmtDate(series.expiry)}</span>
        </div>
        <div className={`mt-0.5 font-mono text-[11px] ${pnl === undefined ? "text-ink-muted" : pnl >= 0n ? "text-good" : "text-critical"}`}>
          {status}
        </div>
        {tx.status === "error" && <p className="mt-1 break-words text-[11.5px] text-critical">{tx.error}</p>}
      </div>
      {action && (
        <button
          type="button"
          disabled={!deployment || !address || tx.busy}
          onClick={action.call}
          className="border border-gold/40 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-gold transition-colors hover:border-gold disabled:opacity-40"
        >
          {tx.busy ? action.busy : action.label}
        </button>
      )}
    </li>
  );
}
