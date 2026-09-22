/// Slippage bounds for order submission.
///
/// `IngotMarket.trade` and `HedgedCredit.open` both take the worst acceptable fill and
/// enforce it on chain. Submitting the extremes — max uint when buying, zero when selling —
/// disables that protection entirely, which on a public mempool means any order can be
/// sandwiched for up to the vault's maximum quote adjustment. So the UI always sends a
/// bound derived from the quote it actually showed the trader.

export const SLIPPAGE_OPTIONS = [10, 50, 100] as const;
export const DEFAULT_SLIPPAGE_BPS = 50;

/// Worst price a buyer will accept: the quote, plus tolerance.
export function maxFill(quoted: bigint, toleranceBps: number): bigint {
  return (quoted * BigInt(10_000 + toleranceBps)) / 10_000n;
}

/// Worst price a seller will accept: the quote, less tolerance.
export function minFill(quoted: bigint, toleranceBps: number): bigint {
  return (quoted * BigInt(10_000 - toleranceBps)) / 10_000n;
}

export function formatTolerance(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}
