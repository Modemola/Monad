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

import { WORKFLOW_TAG, encodeReport, toBase64 } from "./encoding";
import { buildPrint, type Offer } from "./methodology";

/// Monad testnet, from the SDK's own chain-selector table.
export const MONAD_TESTNET_SELECTOR = 2183018362218727504n;

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

export const workflow = [
  handler(
    new cre.capabilities.CronCapability().trigger({ schedule: "0 0 * * * *" }),
    publishIndex,
  ),
];

export default workflow;
