// Pins the index methodology. The keeper and the backtest series must agree, so the rules
// that produce a print are worth holding still.
//
//   node --test "tools/*.test.mjs"
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { computePrint } from "./publish-index.mjs";

const offer = (provider, gpu, usd_hr, kind = "on-demand") => ({ provider, gpu, usd_hr, kind });

/// Provider A lists two H100 SKUs, so its median is 3.00 rather than two votes.
/// Medians are [3.00, 3.50, 4.00]; a 10% trim of three values cuts none; mean is 3.50.
const SNAPSHOT = {
  date: "2026-09-23",
  generated_at: "2026-09-23T10:05:24.883Z",
  offers: [
    offer("a", "h100-sxm", 2.0),
    offer("a", "h100-pcie", 4.0),
    offer("b", "h100", 3.5, "secure"),
    offer("c", "h100-nvl", 4.0),
    offer("d", "h100", 0.1, "spot"), // different product
    offer("d", "h100", 0.2, "community"), // different product
    offer("d", "h100", 0.3, "serverless"), // different product
    offer("e", "mi300x", 9.99), // not an H100
    offer("f", "h100", 0), // no price
  ],
};

test("takes a per-provider median so one provider's SKU list cannot dominate", () => {
  const print = computePrint(SNAPSHOT);
  assert.equal(print.price, 3.5);
});

test("counts every contributing quote and every contributing venue", () => {
  const print = computePrint(SNAPSHOT);
  assert.equal(print.sampleCount, 4, "a's two SKUs, plus b and c");
  assert.equal(print.sourceCount, 3, "a, b and c");
});

test("excludes spot, community and serverless as different products", () => {
  const withoutD = {
    ...SNAPSHOT,
    offers: SNAPSHOT.offers.filter((o) => o.provider !== "d"),
  };
  assert.deepEqual(computePrint(withoutD), computePrint(SNAPSHOT));
});

test("scales to 18 decimals without float error", () => {
  const print = computePrint(SNAPSHOT);
  assert.equal(print.priceWei, "3500000000000000000");
});

test("refuses to print from too few venues rather than publishing a thin number", () => {
  const thin = { ...SNAPSHOT, offers: [offer("a", "h100", 3.0), offer("b", "h100", 4.0)] };
  assert.throws(() => computePrint(thin), /only 2 providers/);
});

test("trims the extremes once there are enough venues to trim", () => {
  // Ten providers: a 10% trim drops the lowest and the highest before averaging.
  const offers = [1, 3, 3, 3, 3, 3, 3, 3, 3, 99].map((price, i) =>
    offer(`p${i}`, "h100", price),
  );
  const print = computePrint({ ...SNAPSHOT, offers });
  assert.equal(print.price, 3, "the 1 and the 99 are trimmed away");
  assert.equal(print.sourceCount, 10);
});
