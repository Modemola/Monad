// Pins the contract calendar the keeper keeps.
//
//   node --test "tools/*.test.mjs"
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeSeries, planLifecycle, ROLL_AHEAD, SELECTORS, TENOR } from "./lifecycle.mjs";

const DAY = 86_400;
const T0 = 1_790_000_000;
const front = (over = {}) => ({ id: 0, windowStart: T0, expiry: T0 + 30 * DAY, settled: false, ...over });

test("a front month with time left needs nothing", () => {
  const plan = planLifecycle({ now: T0 + 10 * DAY, finalizedThrough: T0 + 10 * DAY, series: [front()] });
  assert.deepEqual(plan, []);
});

test("the next month is listed inside the roll window, starting where the front ends", () => {
  const now = T0 + 30 * DAY - ROLL_AHEAD + 60;
  const plan = planLifecycle({ now, finalizedThrough: now, series: [front()] });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].signature, "listSeries(uint64,uint64,int32)");
  assert.deepEqual(plan[0].args, [String(T0 + 30 * DAY), String(T0 + 30 * DAY + TENOR), "0"]);
});

test("once listed, the roll is not repeated", () => {
  const now = T0 + 29 * DAY;
  const next = { id: 1, windowStart: T0 + 30 * DAY, expiry: T0 + 60 * DAY, settled: false };
  assert.deepEqual(planLifecycle({ now, finalizedThrough: now, series: [front(), next] }), []);
});

test("an expired series settles only once the index is final through its expiry", () => {
  const next = { id: 1, windowStart: T0 + 30 * DAY, expiry: T0 + 60 * DAY, settled: false };
  const now = T0 + 30 * DAY + 3600;

  const early = planLifecycle({ now, finalizedThrough: T0 + 30 * DAY - 1, series: [front(), next] });
  assert.deepEqual(early, [], "the right edge of the window is not covered yet");

  const ready = planLifecycle({ now, finalizedThrough: T0 + 30 * DAY + 60, series: [front(), next] });
  assert.deepEqual(ready.map((a) => [a.signature, a.args]), [["settleSeries(uint256)", ["0"]]]);
});

test("a settled series is left alone", () => {
  const next = { id: 1, windowStart: T0 + 30 * DAY, expiry: T0 + 60 * DAY, settled: false };
  const now = T0 + 31 * DAY;
  assert.deepEqual(planLifecycle({ now, finalizedThrough: now, series: [front({ settled: true }), next] }), []);
});

test("a keeper that was down past expiry settles the old month and opens the new window now", () => {
  const now = T0 + 40 * DAY;
  const plan = planLifecycle({ now, finalizedThrough: now - 60, series: [front()] });
  assert.deepEqual(
    plan.map((a) => [a.signature, a.args]),
    [
      ["settleSeries(uint256)", ["0"]],
      ["listSeries(uint64,uint64,int32)", [String(now), String(now + TENOR), "0"]],
    ],
  );
});

test("the vault's position is realized once its series settles, in the same run", () => {
  const vault = "0x00000000000000000000000000000000000000aa";
  const next = { id: 1, windowStart: T0 + 30 * DAY, expiry: T0 + 60 * DAY, settled: false, vaultHolds: false };
  const now = T0 + 30 * DAY + 3600;
  const plan = planLifecycle({ now, finalizedThrough: now, vault, series: [front({ vaultHolds: true }), next] });
  assert.deepEqual(
    plan.map((a) => [a.signature, a.args]),
    [
      ["settleSeries(uint256)", ["0"]],
      ["settlePosition(address,uint256)", [vault, "0"]],
    ],
  );

  const after = planLifecycle({ now, finalizedThrough: now, vault, series: [front({ settled: true, vaultHolds: false }), next] });
  assert.deepEqual(after, [], "nothing left once it is realized");
});

test("series decode from the seriesAt return words", () => {
  const words = [T0 - 5, T0, T0 + 30 * DAY, 1, 0, 2_500_000_000_000_000_000n, 0].map((v) =>
    BigInt(v).toString(16).padStart(64, "0"),
  );
  assert.deepEqual(decodeSeries(7, "0x" + words.join("")), {
    id: 7,
    windowStart: T0,
    expiry: T0 + 30 * DAY,
    settled: true,
  });
});

// The selectors are hand-pinned; check them against the compiled contracts whenever a build is
// present (CI's contracts job, or any local `forge build`).
const artifact = (name) => new URL(`../contracts/out/${name}.sol/${name}.json`, import.meta.url);
test("pinned selectors match the contracts", { skip: !existsSync(artifact("IngotMarket")) }, () => {
  const market = JSON.parse(readFileSync(artifact("IngotMarket"), "utf8")).methodIdentifiers;
  const index = JSON.parse(readFileSync(artifact("IngotIndex"), "utf8")).methodIdentifiers;
  assert.equal(SELECTORS.seriesCount, "0x" + market["seriesCount()"]);
  assert.equal(SELECTORS.seriesAt, "0x" + market["seriesAt(uint256)"]);
  assert.equal(SELECTORS.finalizedThrough, "0x" + index["finalizedThrough()"]);
  assert.equal(SELECTORS.vault, "0x" + market["vault()"]);
  assert.equal(SELECTORS.positionOf, "0x" + market["positionOf(address,uint256)"]);
});
