/// The Ingot index publisher, as a Chainlink CRE workflow.
///
/// Why this exists: `IngotIndex` trusts allowlisted publisher keys, so one compromised key can
/// walk the settlement price within the deviation band. This workflow replaces the key with a
/// quorum. Every hour, each node of the DON independently fetches venue rates, applies the
/// published methodology, and the DON takes the **median across nodes** before a single signed
/// report is written to `IngotIndexReceiver` on Monad.
///
/// Two layers of aggregation, doing different jobs:
///   - within a node: a trimmed mean across venues, which is the index methodology;
///   - across nodes:  a median, which is the consensus. A node that is lied to by one venue, or
///                    fails to reach it, cannot move the published number.

import {
  EVMClient,
  type NodeRuntime,
  type Runtime,
  consensusMedianAggregation,
  cre,
  handler,
} from "@chainlink/cre-sdk";

import { buildPrint, type Offer } from "./methodology";

/// Monad testnet, from the SDK's own chain-selector table.
export const MONAD_TESTNET_SELECTOR = 2183018362218727504n;

/// Stamped into every report body and checked by IngotIndexReceiver, so a report from some other
/// workflow aimed at our receiver is rejected on chain.
export const WORKFLOW_TAG = "ingot-h100-index-v1";

export type Config = {
  /// Address of IngotIndexReceiver on Monad.
  receiver: `0x${string}`;
  /// Venue endpoints each node queries independently.
  venues: string[];
  /// Cron schedule. Hourly by default; the index's own minInterval is the real floor.
  schedule: string;
};

/// One node's view of the market: fetch every venue, keep what parses, build the print.
///
/// Failures are swallowed per venue rather than aborting the node. A venue being down is normal,
/// and the methodology already requires a minimum number of venues before it will produce a
/// number at all — so a thin sample fails loudly in `buildPrint` instead of quietly publishing a
/// price derived from two providers.
function fetchPriceOnThisNode(nodeRuntime: NodeRuntime<Config>): number {
  const http = new cre.capabilities.HTTPClient();
  const offers: Offer[] = [];

  for (const url of nodeRuntime.config.venues) {
    try {
      const response = http.sendRequest(nodeRuntime, { url, method: "GET" }).result();
      const body = JSON.parse(new TextDecoder().decode(response.body));
      if (Array.isArray(body?.offers)) offers.push(...(body.offers as Offer[]));
    } catch (error) {
      nodeRuntime.log(`venue ${url} unavailable: ${String(error)}`);
    }
  }

  const print = buildPrint(offers);
  nodeRuntime.log(
    `node print $${print.price.toFixed(4)}/GPU-hour from ${print.sourceCount} venues, ${print.sampleCount} quotes`,
  );

  // Consensus is taken on the integer price; the counts are reported from the agreed sample below.
  return print.price;
}

/// The hourly job: agree a price across the DON, then write one signed report to Monad.
const publishIndex = async (runtime: Runtime<Config>) => {
  const agreedPrice = runtime
    .runInNodeMode(fetchPriceOnThisNode, consensusMedianAggregation())()
    .result();

  const observedAt = Math.floor(runtime.now().getTime() / 1000);
  const priceWei = BigInt(Math.round(agreedPrice * 1e9)) * 10n ** 9n;

  runtime.log(`DON agreed $${agreedPrice.toFixed(4)}/GPU-hour at ${observedAt}`);

  const encoded = encodeReport({
    tag: WORKFLOW_TAG,
    observedAt: BigInt(observedAt),
    priceWei,
    sampleCount: 0n,
    sourceCount: 0n,
  });

  const report = runtime
    .report({
      // Protobuf JSON carries `bytes` as base64, which tsc caught when this was passed raw.
      encodedPayload: toBase64(encoded),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const evm = new EVMClient(MONAD_TESTNET_SELECTOR);
  const receipt = evm
    .writeReport(runtime, { receiver: runtime.config.receiver, report })
    .result();

  runtime.log(`published: ${JSON.stringify(receipt)}`);
  return { price: agreedPrice, observedAt };
};

/// ABI-encode `(bytes32, uint64, uint256, uint32, uint16)` — the body IngotIndexReceiver decodes.
/// Hand-rolled because the workflow runs in a restricted WASM sandbox without an ABI library.
export function encodeReport(input: {
  tag: string;
  observedAt: bigint;
  priceWei: bigint;
  sampleCount: bigint;
  sourceCount: bigint;
}): Uint8Array {
  const words: bigint[] = [
    bytes32FromAscii(input.tag),
    input.observedAt,
    input.priceWei,
    input.sampleCount,
    input.sourceCount,
  ];

  const out = new Uint8Array(words.length * 32);
  words.forEach((word, index) => {
    const bytes = word.toString(16).padStart(64, "0");
    for (let i = 0; i < 32; i += 1) {
      out[index * 32 + i] = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
    }
  });
  return out;
}

/// Base64 without Buffer or btoa: the workflow runs in a restricted WASM sandbox and neither is
/// guaranteed to be present.
export function toBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const c = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    out += alphabet[a >> 2];
    out += alphabet[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : alphabet[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : alphabet[c & 0x3f];
  }

  return out;
}

/// The tag is a right-padded ASCII bytes32, matching `bytes32("ingot-h100-index-v1")` in Solidity.
export function bytes32FromAscii(text: string): bigint {
  if (text.length > 32) throw new Error("tag longer than 32 bytes");
  let hex = "";
  for (let i = 0; i < text.length; i += 1) hex += text.charCodeAt(i).toString(16).padStart(2, "0");
  return BigInt("0x" + hex.padEnd(64, "0"));
}

export const workflow = [
  handler(
    new cre.capabilities.CronCapability().trigger({ schedule: "0 0 * * * *" }),
    publishIndex,
  ),
];

export default workflow;
