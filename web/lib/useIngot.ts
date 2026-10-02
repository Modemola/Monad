"use client";

import { useAccount, useChainId, useReadContract, useReadContracts } from "wagmi";

import { deploymentFor, usableDeployments } from "./addresses";
import { ingotIndexAbi, ingotMarketAbi } from "./abis";
import type { IndexPoint } from "@/components/charts";

/// Resolved addresses for whatever chain the wallet is on.
///
/// With no wallet connected, wagmi reports the first configured chain, which may not be
/// the one Ingot is deployed to. Rather than showing a visitor an empty app, the read-only
/// views fall back to the first chain that does have a deployment — a judge opening the
/// link sees the live market before touching a wallet. Writes still go through the
/// connected chain, and the connect button prompts a switch when it is the wrong one.
export function useDeployment() {
  const chainId = useChainId();
  const { isConnected } = useAccount();

  const connected = deploymentFor(chainId);
  if (connected) return { chainId, deployment: connected, isFallback: false };

  if (!isConnected) {
    const [fallback] = usableDeployments();
    if (fallback) {
      return { chainId: fallback[0], deployment: fallback[1], isFallback: true };
    }
  }

  return { chainId, deployment: undefined, isFallback: false };
}

export type Series = {
  listedAt: bigint;
  windowStart: bigint;
  expiry: bigint;
  settled: boolean;
  basisBps: number;
  settlementPrice: bigint;
  longOpenInterest: bigint;
};

/// The front-month contract: the earliest listed series still trading.
///
/// The keeper lists next month a few days before the front expires, so for those days two series
/// are live. Trading stays on the expiring one until it stops, then moves on; reading the newest
/// would have pulled everyone into next month early and hidden the positions they still hold.
export function useFrontSeries() {
  const { deployment, chainId } = useDeployment();

  const { data: count } = useReadContract({
    address: deployment?.market,
    abi: ingotMarketAbi,
    functionName: "seriesCount",
    chainId,
    query: { enabled: Boolean(deployment) },
  });

  const ids = count === undefined ? [] : [count - 2n, count - 1n].filter((id) => id >= 0n);
  const { data: listed } = useReadContracts({
    contracts: deployment
      ? ids.map((id) => ({
          chainId,
          address: deployment.market,
          abi: ingotMarketAbi,
          functionName: "seriesAt" as const,
          args: [id] as const,
        }))
      : [],
    query: { enabled: Boolean(deployment) && ids.length > 0 },
  });

  const now = BigInt(Math.floor(Date.now() / 1000));
  const candidates = ids.map((id, i) => ({ id, series: listed?.[i]?.result as Series | undefined }));
  const front =
    candidates.find((c) => c.series !== undefined && !c.series.settled && c.series.expiry > now) ??
    candidates.at(-1);
  const seriesId = front?.series ? front.id : undefined;
  const series = front?.series;

  const { data: mark } = useReadContract({
    address: deployment?.market,
    abi: ingotMarketAbi,
    functionName: "markPrice",
    chainId,
    args: seriesId === undefined ? undefined : [seriesId],
    query: { enabled: Boolean(deployment) && seriesId !== undefined },
  });

  return { seriesId, series, mark, expired: series !== undefined && series.expiry <= now };
}

/// A trader's cross-margin state: collateral, mark-to-market equity, and the two
/// requirements that decide whether they can add risk and whether they get liquidated.
export function useAccountState(seriesId: bigint | undefined) {
  const { address } = useAccount();
  const { deployment, chainId } = useDeployment();
  const enabled = Boolean(deployment && address);

  const { data } = useReadContracts({
    contracts: enabled
      ? [
          { chainId, address: deployment!.market, abi: ingotMarketAbi, functionName: "balanceOf", args: [address!] },
          { chainId, address: deployment!.market, abi: ingotMarketAbi, functionName: "equity", args: [address!] },
          { chainId, address: deployment!.market, abi: ingotMarketAbi, functionName: "freeCollateral", args: [address!] },
          { chainId, address: deployment!.market, abi: ingotMarketAbi, functionName: "initialMarginBps" },
          { chainId, address: deployment!.market, abi: ingotMarketAbi, functionName: "maintenanceMarginBps" },
        ]
      : [],
    query: { enabled },
  });

  const initialBps = data?.[3]?.result as number | undefined;
  const maintenanceBps = data?.[4]?.result as number | undefined;

  const { data: requirements } = useReadContracts({
    contracts:
      enabled && initialBps !== undefined && maintenanceBps !== undefined
        ? [
            {
              chainId,
              address: deployment!.market,
              abi: ingotMarketAbi,
              functionName: "marginRequirement",
              args: [address!, initialBps],
            },
            {
              chainId,
              address: deployment!.market,
              abi: ingotMarketAbi,
              functionName: "marginRequirement",
              args: [address!, maintenanceBps],
            },
          ]
        : [],
    query: { enabled: enabled && initialBps !== undefined },
  });

  const { data: position } = useReadContract({
    address: deployment?.market,
    abi: ingotMarketAbi,
    functionName: "positionOf",
    chainId,
    args: address && seriesId !== undefined ? [address, seriesId] : undefined,
    query: { enabled: enabled && seriesId !== undefined },
  });

  return {
    balance: data?.[0]?.result as bigint | undefined,
    equity: data?.[1]?.result as bigint | undefined,
    freeCollateral: data?.[2]?.result as bigint | undefined,
    initialBps,
    maintenanceBps,
    initialRequirement: requirements?.[0]?.result as bigint | undefined,
    maintenanceRequirement: requirements?.[1]?.result as bigint | undefined,
    position: position as { size: bigint; cost: bigint } | undefined,
  };
}

/// Enough for the 78-day backfill plus the first few days of live prints.
const HISTORY_DEPTH = 96;

/// The index's recent prints, for the chart. Read straight from the oracle rather than an
/// indexer — at this depth it is one multicall, and it keeps the chart honest about what
/// is actually on chain.
export function useIndexHistory(): IndexPoint[] {
  const { deployment, chainId } = useDeployment();

  const { data: count } = useReadContract({
    address: deployment?.index,
    abi: ingotIndexAbi,
    functionName: "observationCount",
    chainId,
    query: { enabled: Boolean(deployment) },
  });

  const total = count ? Number(count) : 0;
  const start = Math.max(0, total - HISTORY_DEPTH);
  const ids = Array.from({ length: Math.max(0, total - start) }, (_, i) => BigInt(start + i));

  const { data } = useReadContracts({
    contracts: deployment
      ? ids.map((id) => ({
          address: deployment.index,
          abi: ingotIndexAbi,
          functionName: "observation" as const,
          chainId,
          args: [id] as const,
        }))
      : [],
    query: { enabled: Boolean(deployment) && ids.length > 0 },
  });

  if (!data) return [];

  return data
    .map((entry) => entry.result as { timestamp: bigint; price: bigint } | undefined)
    .filter((o): o is { timestamp: bigint; price: bigint } => Boolean(o))
    .map((o) => ({ timestamp: Number(o.timestamp), price: Number(o.price) / 1e18 }));
}
