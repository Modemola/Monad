// Port of contracts/src/libraries/Units.sol and IngotMarket._applyDelta.
//
// BigInt division truncates toward zero, exactly like Solidity's signed division, so these
// reproduce the contract to the unit rather than approximately. That is what lets the indexer
// hold cost basis and realized PnL for the vault, which emits no event of its own.

/** size (1e18) × price (1e18) → USDC (1e6). */
export const NOTIONAL_DIVISOR = 10n ** 30n;

export const DAY = 86_400;

export function notional(size: bigint, price: bigint): bigint {
  return (size * price) / NOTIONAL_DIVISOR;
}

export function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/** Solidity's Units.sameSign: zero counts as positive. */
export function sameSign(a: bigint, b: bigint): boolean {
  return a >= 0n === b >= 0n;
}

export interface PositionState {
  size: bigint;
  cost: bigint;
}

export interface Fill extends PositionState {
  realized: bigint;
}

/** Apply a signed fill of `delta` GPU-hours at `price`, as IngotMarket._applyDelta does. */
export function applyDelta(position: PositionState, delta: bigint, price: bigint): Fill {
  const held = position.size;
  let size = held;
  let cost = position.cost;
  let realized = 0n;

  if (held !== 0n && !sameSign(held, delta)) {
    const heldAbs = abs(held);
    let closing = abs(delta);
    if (closing > heldAbs) closing = heldAbs;

    const removed = held > 0n ? closing : -closing;
    const costRemoved = (cost * closing) / heldAbs;

    realized = notional(removed, price) - costRemoved;
    size = held - removed;
    cost = cost - costRemoved;

    const remainder = delta + removed;
    if (remainder !== 0n) {
      size += remainder;
      cost += notional(remainder, price);
    }
  } else {
    size = held + delta;
    cost = cost + notional(delta, price);
  }

  if (size === 0n) cost = 0n;
  return { size, cost, realized };
}

/** Change in long open interest when one account moves from `before` to `after`. */
export function openInterestDelta(before: bigint, after: bigint): bigint {
  return (after > 0n ? after : 0n) - (before > 0n ? before : 0n);
}

export function dayOf(timestamp: number): number {
  return Math.floor(timestamp / DAY);
}
