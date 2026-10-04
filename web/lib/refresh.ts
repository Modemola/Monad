import type { Query } from "@tanstack/react-query";

/// How often each on-chain value is worth re-reading, by the function that reads it.
///
/// Polling everything every two seconds sent a request per value, per page, per tick — dozens a
/// second on the terminal, against a public RPC that rate-limits — and re-rendered the page each
/// time. Most of those values cannot change that fast. Risk parameters change only when the owner
/// retunes them, the index prints every few hours, a loan's projection is fixed once it opens.
/// Anything the visitor changes themselves is refreshed at once anyway: every confirmed
/// transaction invalidates every query (lib/tx.ts).

/// Set at deploy or by an owner call: read once.
const FIXED = new Set([
  "takerFeeBps",
  "initialMarginBps",
  "maintenanceMarginBps",
  "pendingMoveLimitBps",
  "ltvBps",
  "rateBps",
  "minMarginBps",
  "maxBasisRatioBps",
  "minPrincipal",
  "hedgeMarginBps",
  "finalityDelay",
  "decimals",
  "project", // a loan's recovery curve depends only on the loan and the price asked about
  "observation", // a print never changes once published (a revoked tip is a new id)
]);

/// Changes on the index's or the calendar's schedule: hours, not seconds.
const SLOW = new Set([
  "observationCount",
  "finalizedThrough",
  "seriesCount",
  "seriesAt",
  "loanCount",
  "loansOf",
  "loanAt",
  "openSeriesOf",
  "pendingMoveBps",
]);

const LIVE_MS = 6_000;
const SLOW_MS = 60_000;

function functionNames(queryKey: readonly unknown[]): string[] {
  const options = queryKey[1] as
    | { functionName?: string; contracts?: { functionName?: string }[] }
    | undefined;
  if (!options || typeof options !== "object") return [];
  if (options.functionName) return [options.functionName];
  return (options.contracts ?? []).map((c) => c.functionName ?? "");
}

/// The fastest any value in this query needs refreshing; `false` when none of them ever does.
export function refreshInterval(query: Query): number | false {
  const names = functionNames(query.queryKey);
  if (names.length === 0) return LIVE_MS;
  if (names.every((n) => FIXED.has(n))) return false;
  if (names.every((n) => FIXED.has(n) || SLOW.has(n))) return SLOW_MS;
  return LIVE_MS;
}

/// Fixed values are never stale, so remounting a page does not re-read them either.
export function staleTime(query: Query): number {
  const interval = refreshInterval(query);
  return interval === false ? Infinity : Math.min(interval, 4_000);
}
