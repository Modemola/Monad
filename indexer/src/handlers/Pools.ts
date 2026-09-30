import { indexer, type EvmOnEventContext } from "envio";

import { eventId, protocol } from "../lib/store.js";

type Flow = {
  pool: "Underwriter" | "Credit";
  kind: "Deposit" | "Redeem";
  account: string;
  assets: bigint;
  shares: bigint;
};

async function record(
  context: EvmOnEventContext,
  event: { block: { number: number; timestamp: number }; logIndex: number; transaction: { hash: string } },
  flow: Flow,
) {
  context.PoolFlow.set({
    id: eventId(event),
    ...flow,
    timestamp: BigInt(event.block.timestamp),
    txHash: event.transaction.hash,
  });

  const signed = flow.kind === "Deposit" ? flow.assets : -flow.assets;
  const p = await protocol(context);
  context.Protocol.set(
    flow.pool === "Underwriter"
      ? { ...p, underwriterNetFlow: p.underwriterNetFlow + signed }
      : { ...p, creditNetFlow: p.creditNetFlow + signed },
  );
}

// Underwriters take the other side of every trade.
indexer.onEvent({ contract: "UnderwriterVault", event: "Deposited" }, async ({ event, context }) => {
  const { account, assets, shares } = event.params;
  await record(context, event, { pool: "Underwriter", kind: "Deposit", account, assets, shares });
});

indexer.onEvent({ contract: "UnderwriterVault", event: "Redeemed" }, async ({ event, context }) => {
  const { account, shares, assets } = event.params;
  await record(context, event, { pool: "Underwriter", kind: "Redeem", account, assets, shares });
});

// Lenders fund hedged loans.
indexer.onEvent({ contract: "HedgedCredit", event: "LenderDeposited" }, async ({ event, context }) => {
  const { lender, assets, shares } = event.params;
  await record(context, event, { pool: "Credit", kind: "Deposit", account: lender, assets, shares });
});

indexer.onEvent({ contract: "HedgedCredit", event: "LenderRedeemed" }, async ({ event, context }) => {
  const { lender, shares, assets } = event.params;
  await record(context, event, { pool: "Credit", kind: "Redeem", account: lender, assets, shares });
});
