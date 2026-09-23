/// Local simulation of the CRE workflow.
///
///   pnpm simulate
///
/// Runs the exact methodology the workflow runs, over a real venue snapshot, and prints the
/// report body it would hand to the DON. Also writes the encoded payload to
/// `fixtures/report-payload.hex`, which a Foundry test decodes — so the TypeScript encoder and
/// the Solidity decoder are checked against each other rather than assumed to agree.
///
/// This is the "simulate" half of the CRE workflow lifecycle. Deploying to a live DON needs the
/// CRE CLI and a funded workflow registration; the logic under test is identical either way,
/// because both paths import the same `methodology.ts`.

import { readFileSync, writeFileSync } from "node:fs";

import { buildPrint, type Offer } from "./methodology";
import { WORKFLOW_TAG, bytes32FromAscii, encodeReport, toBase64 } from "./workflow";

const snapshot = JSON.parse(
  readFileSync(new URL("./fixtures/venue-snapshot.json", import.meta.url), "utf8"),
) as { date: string; offers: Offer[] };

console.log(`venue snapshot ${snapshot.date}: ${snapshot.offers.length} offers across all GPUs\n`);

// --- what one DON node would compute -------------------------------------------------------

const print = buildPrint(snapshot.offers);

console.log("one node's print");
console.log(`  price        $${print.price.toFixed(4)} / GPU-hour`);
console.log(`  price (wei)  ${print.priceWei}`);
console.log(`  venues       ${print.sourceCount}`);
console.log(`  quotes       ${print.sampleCount}`);

// --- what the DON agrees on ----------------------------------------------------------------
//
// Nodes see slightly different books: a venue rate-limits one node, another is mid-update. The
// median across nodes is what makes a single misled node unable to move the published number.

const nodeViews = [print.price, print.price * 1.004, print.price * 0.997, print.price * 1.001, 99.0];
const sorted = [...nodeViews].sort((a, b) => a - b);
const agreed = sorted[Math.floor(sorted.length / 2)];

console.log("\nconsensus across 5 nodes");
console.log(`  node prices  ${nodeViews.map((p) => `$${p.toFixed(3)}`).join(", ")}`);
console.log(`  median       $${agreed.toFixed(4)}`);
console.log(`  note         the $99.00 node is outvoted, not averaged in`);

// --- the report body ------------------------------------------------------------------------

const observedAt = BigInt(Math.floor(Date.parse(`${snapshot.date}T12:00:00Z`) / 1000));
const priceWei = BigInt(Math.round(agreed * 1e9)) * 10n ** 9n;

const payload = encodeReport({
  tag: WORKFLOW_TAG,
  observedAt,
  priceWei,
  sampleCount: BigInt(print.sampleCount),
  sourceCount: BigInt(print.sourceCount),
});

const hex = `0x${[...payload].map((b) => b.toString(16).padStart(2, "0")).join("")}`;

console.log("\nreport body handed to the DON");
console.log(`  tag          ${WORKFLOW_TAG} (0x${bytes32FromAscii(WORKFLOW_TAG).toString(16).padStart(64, "0")})`);
console.log(`  observedAt   ${observedAt}`);
console.log(`  priceWei     ${priceWei}`);
console.log(`  bytes        ${payload.length} (${payload.length / 32} words)`);
console.log(`  base64       ${toBase64(payload).slice(0, 44)}…`);

writeFileSync(new URL("./fixtures/report-payload.hex", import.meta.url), hex);
console.log(`\nwrote fixtures/report-payload.hex — decoded by IngotIndexReceiver.t.sol`);
