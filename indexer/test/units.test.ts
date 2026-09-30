import { describe, it } from "vitest";

import { applyDelta, notional, openInterestDelta } from "../src/lib/units.js";

const H = 10n ** 18n; // one GPU-hour
const P = (usd: number) => BigInt(Math.round(usd * 100)) * 10n ** 16n; // price, 18 decimals

describe("notional", () => {
  it("truncates toward zero on both sides, like Solidity", (t) => {
    // 1 wei of size at $1 is 1e-30 USDC: rounds to zero, not to -1 for a short.
    t.expect(notional(1n, P(1))).toBe(0n);
    t.expect(notional(-1n, P(1))).toBe(0n);
    t.expect(notional(730n * H, P(2.5))).toBe(1_825_000_000n);
    t.expect(notional(-730n * H, P(2.5))).toBe(-1_825_000_000n);
  });
});

describe("applyDelta", () => {
  it("opens and adds at the fill price", (t) => {
    const a = applyDelta({ size: 0n, cost: 0n }, 100n * H, P(2));
    const b = applyDelta(a, 100n * H, P(3));
    t.expect(b).toEqual({ size: 200n * H, cost: 500_000_000n, realized: 0n });
  });

  it("realizes pro rata on a reduce and keeps the rest of the basis", (t) => {
    const r = applyDelta({ size: 200n * H, cost: 500_000_000n }, -50n * H, P(4));
    // Removed a quarter of the basis ($125) for $200.
    t.expect(r).toEqual({ size: 150n * H, cost: 375_000_000n, realized: 75_000_000n });
  });

  it("flips through zero: closes at a PnL, reopens the remainder at the fill", (t) => {
    const r = applyDelta({ size: 100n * H, cost: 200_000_000n }, -150n * H, P(3));
    t.expect(r).toEqual({ size: -50n * H, cost: -150_000_000n, realized: 100_000_000n });
  });

  it("clears cost when flat so dust cannot linger", (t) => {
    const r = applyDelta({ size: 3n, cost: 1n }, -3n, P(1));
    t.expect(r.size).toBe(0n);
    t.expect(r.cost).toBe(0n);
  });
});

describe("openInterestDelta", () => {
  it("counts only the long side", (t) => {
    t.expect(openInterestDelta(0n, 5n)).toBe(5n);
    t.expect(openInterestDelta(5n, -3n)).toBe(-5n);
    t.expect(openInterestDelta(-3n, -8n)).toBe(0n);
    t.expect(openInterestDelta(-3n, 4n)).toBe(4n);
  });
});
