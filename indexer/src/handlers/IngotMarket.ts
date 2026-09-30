import { indexer, type EvmOnEventContext, type Position, type Protocol, type Series } from "envio";

import { account, day, eventId, isVault, position, protocol } from "../lib/store.js";
import { abs, applyDelta, notional, openInterestDelta, type Fill } from "../lib/units.js";

// ---------------------------------------------------------------- setup

indexer.onEvent({ contract: "IngotMarket", event: "VaultSet" }, async ({ event, context }) => {
  const p = await protocol(context);
  context.Protocol.set({ ...p, vault: event.params.vault });

  const vault = await account(context, event.params.vault, true);
  context.Account.set({ ...vault, isVault: true });
});

indexer.onEvent({ contract: "IngotMarket", event: "SeriesListed" }, async ({ event, context }) => {
  const { seriesId, windowStart, expiry, basisBps } = event.params;

  context.Series.set({
    id: seriesId.toString(),
    seriesId,
    windowStart,
    expiry,
    basisBps: Number(basisBps),
    settled: false,
    settlementPrice: undefined,
    longOpenInterest: 0n,
    vaultInventory: 0n,
    tradeCount: 0,
    volumeHours: 0n,
    notionalVolume: 0n,
    fees: 0n,
    listedAt: BigInt(event.block.timestamp),
  });

  const p = await protocol(context);
  context.Protocol.set({ ...p, seriesListed: p.seriesListed + 1 });
});

indexer.onEvent({ contract: "IngotMarket", event: "SeriesSettled" }, async ({ event, context }) => {
  const series = await context.Series.getOrThrow(event.params.seriesId.toString());
  context.Series.set({ ...series, settled: true, settlementPrice: event.params.settlementPrice });

  const p = await protocol(context);
  context.Protocol.set({ ...p, seriesSettled: p.seriesSettled + 1 });
});

// ---------------------------------------------------------------- collateral

indexer.onEvent({ contract: "IngotMarket", event: "Deposited" }, async ({ event, context }) => {
  const a = await account(context, event.params.account);
  context.Account.set({ ...a, collateralDeposited: a.collateralDeposited + event.params.amount });
});

indexer.onEvent({ contract: "IngotMarket", event: "Withdrawn" }, async ({ event, context }) => {
  const a = await account(context, event.params.account);
  context.Account.set({ ...a, collateralWithdrawn: a.collateralWithdrawn + event.params.amount });
});

indexer.onEvent({ contract: "IngotMarket", event: "BadDebtAbsorbed" }, async ({ event, context }) => {
  const { account: who, amount } = event.params;
  const a = await account(context, who);
  context.Account.set({ ...a, badDebt: a.badDebt + amount });

  const p = await protocol(context);
  context.Protocol.set({ ...p, badDebt: p.badDebt + amount });
});

// ---------------------------------------------------------------- fills

interface Moved {
  p: Protocol;
  series: Series;
  fill: Fill;
  vaultFill: Fill | undefined;
  openInterestChange: bigint;
}

/**
 * Every fill has two sides: the account moves by `size`, the vault by `-size`, both at `price`.
 * Applies both, keeps open interest and vault inventory in step, and returns what moved.
 */
async function fill(
  context: EvmOnEventContext,
  who: string,
  seriesId: bigint,
  size: bigint,
  price: bigint,
  timestamp: bigint,
): Promise<Moved> {
  const [p, series] = await Promise.all([
    protocol(context),
    context.Series.getOrThrow(seriesId.toString()),
  ]);

  const mine = await position(context, who, seriesId);
  const fill = applyDelta(mine, size, price);
  context.Position.set(settle(mine, fill, timestamp));
  let openInterestChange = openInterestDelta(mine.size, fill.size);

  let vaultFill: Fill | undefined;
  if (p.vault === undefined) {
    context.log.warn(`fill on series ${seriesId} before VaultSet; vault side not tracked`);
  } else {
    const theirs = await position(context, p.vault, seriesId);
    vaultFill = applyDelta(theirs, -size, price);
    context.Position.set(settle(theirs, vaultFill, timestamp));
    openInterestChange += openInterestDelta(theirs.size, vaultFill.size);

    const vault = await account(context, p.vault, true);
    context.Account.set({ ...vault, realizedPnl: vault.realizedPnl + vaultFill.realized });
  }

  return { p, series, fill, vaultFill, openInterestChange };
}

function settle(before: Position, after: Fill, timestamp: bigint): Position {
  return {
    ...before,
    size: after.size,
    cost: after.cost,
    realizedPnl: before.realizedPnl + after.realized,
    settled: false,
    updatedAt: timestamp,
  };
}

indexer.onEvent({ contract: "IngotMarket", event: "Traded" }, async ({ event, context }) => {
  const { account: trader, seriesId, size, price, realizedPnl, fee } = event.params;
  const timestamp = BigInt(event.block.timestamp);

  const moved = await fill(context, trader, seriesId, size, price, timestamp);
  const { p, series, vaultFill, openInterestChange } = moved;

  // The port of _applyDelta is exact; a mismatch here means the indexer has missed an event.
  if (moved.fill.realized !== realizedPnl) {
    context.log.error(
      `realized PnL drift for ${trader} on series ${seriesId}: indexed ${moved.fill.realized}, emitted ${realizedPnl}`,
    );
  }

  const hours = abs(size);
  const value = abs(notional(size, price));

  const a = await account(context, trader);
  const firstTrade = a.tradeCount === 0;
  context.Account.set({
    ...a,
    realizedPnl: a.realizedPnl + realizedPnl,
    fees: a.fees + fee,
    tradeCount: a.tradeCount + 1,
  });

  context.Trade.set({
    id: eventId(event),
    account_id: trader,
    series_id: seriesId.toString(),
    size,
    price,
    notional: value,
    realizedPnl,
    fee,
    positionAfter: moved.fill.size,
    timestamp,
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
  });

  context.Series.set({
    ...series,
    longOpenInterest: series.longOpenInterest + openInterestChange,
    vaultInventory: vaultFill?.size ?? series.vaultInventory,
    tradeCount: series.tradeCount + 1,
    volumeHours: series.volumeHours + hours,
    notionalVolume: series.notionalVolume + value,
    fees: series.fees + fee,
  });

  const updated = {
    ...p,
    longOpenInterest: p.longOpenInterest + openInterestChange,
    tradeCount: p.tradeCount + 1,
    volumeHours: p.volumeHours + hours,
    notionalVolume: p.notionalVolume + value,
    fees: p.fees + fee,
    traders: p.traders + (firstTrade ? 1 : 0),
  };
  context.Protocol.set(updated);

  const d = await day(context, event.block.timestamp, updated);
  context.DailySnapshot.set({
    ...d,
    longOpenInterest: updated.longOpenInterest,
    tradeCount: d.tradeCount + 1,
    volumeHours: d.volumeHours + hours,
    notionalVolume: d.notionalVolume + value,
    fees: d.fees + fee,
  });
});

indexer.onEvent({ contract: "IngotMarket", event: "Liquidated" }, async ({ event, context }) => {
  const { account: who, seriesId, liquidator, size, price, penalty } = event.params;
  const timestamp = BigInt(event.block.timestamp);

  const { p, series, fill: moved, vaultFill, openInterestChange } = await fill(
    context,
    who,
    seriesId,
    size,
    price,
    timestamp,
  );

  const a = await account(context, who);
  context.Account.set({
    ...a,
    realizedPnl: a.realizedPnl + moved.realized,
    liquidationPenalties: a.liquidationPenalties + penalty,
  });

  context.Liquidation.set({
    id: eventId(event),
    account_id: who,
    series_id: seriesId.toString(),
    liquidator,
    size,
    price,
    penalty,
    realizedPnl: moved.realized,
    timestamp,
    txHash: event.transaction.hash,
  });

  context.Series.set({
    ...series,
    longOpenInterest: series.longOpenInterest + openInterestChange,
    vaultInventory: vaultFill?.size ?? series.vaultInventory,
  });

  const updated = {
    ...p,
    longOpenInterest: p.longOpenInterest + openInterestChange,
    liquidations: p.liquidations + 1,
  };
  context.Protocol.set(updated);

  const d = await day(context, event.block.timestamp, updated);
  context.DailySnapshot.set({
    ...d,
    longOpenInterest: updated.longOpenInterest,
    liquidations: d.liquidations + 1,
  });
});

indexer.onEvent({ contract: "IngotMarket", event: "PositionSettled" }, async ({ event, context }) => {
  const { account: who, seriesId, size, realizedPnl } = event.params;
  const timestamp = BigInt(event.block.timestamp);

  const [p, series, pos, a] = await Promise.all([
    protocol(context),
    context.Series.getOrThrow(seriesId.toString()),
    position(context, who, seriesId),
    account(context, who),
  ]);

  context.Position.set({
    ...pos,
    size: 0n,
    cost: 0n,
    realizedPnl: pos.realizedPnl + realizedPnl,
    settled: true,
    updatedAt: timestamp,
  });
  context.Account.set({ ...a, realizedPnl: a.realizedPnl + realizedPnl });

  const released = size > 0n ? size : 0n;
  context.Series.set({
    ...series,
    longOpenInterest: series.longOpenInterest - released,
    vaultInventory: isVault(p, who) ? 0n : series.vaultInventory,
  });

  const updated = { ...p, longOpenInterest: p.longOpenInterest - released };
  context.Protocol.set(updated);

  const d = await day(context, event.block.timestamp, updated);
  context.DailySnapshot.set({ ...d, longOpenInterest: updated.longOpenInterest });
});
