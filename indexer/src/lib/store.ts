import type { Account, DailySnapshot, EvmOnEventContext, Position, Protocol } from "envio";

import { DAY, dayOf } from "./units.js";

type Context = EvmOnEventContext;

export const PROTOCOL_ID = "ingot";

export function eventId(event: { block: { number: number }; logIndex: number }): string {
  return `${event.block.number}-${event.logIndex}`;
}

export function protocol(context: Context): Promise<Protocol> {
  return context.Protocol.getOrCreate({
    id: PROTOCOL_ID,
    vault: undefined,
    prints: 0,
    revocations: 0,
    latestPrice: undefined,
    latestObservedAt: undefined,
    seriesListed: 0,
    seriesSettled: 0,
    longOpenInterest: 0n,
    tradeCount: 0,
    volumeHours: 0n,
    notionalVolume: 0n,
    fees: 0n,
    liquidations: 0,
    badDebt: 0n,
    traders: 0,
    loansOpened: 0,
    loansOpen: 0,
    principalOutstanding: 0n,
    principalLent: 0n,
    hedgePnlRealized: 0n,
    underwriterNetFlow: 0n,
    creditNetFlow: 0n,
  });
}

export function isVault(p: Protocol, address: string): boolean {
  return p.vault !== undefined && p.vault.toLowerCase() === address.toLowerCase();
}

export function account(context: Context, id: string, vault = false): Promise<Account> {
  return context.Account.getOrCreate({
    id,
    isVault: vault,
    collateralDeposited: 0n,
    collateralWithdrawn: 0n,
    realizedPnl: 0n,
    fees: 0n,
    liquidationPenalties: 0n,
    badDebt: 0n,
    tradeCount: 0,
  });
}

export function positionId(accountId: string, seriesId: bigint): string {
  return `${accountId}-${seriesId}`;
}

export function position(context: Context, accountId: string, seriesId: bigint): Promise<Position> {
  return context.Position.getOrCreate({
    id: positionId(accountId, seriesId),
    account_id: accountId,
    series_id: seriesId.toString(),
    size: 0n,
    cost: 0n,
    realizedPnl: 0n,
    settled: false,
    updatedAt: 0n,
  });
}

/**
 * The snapshot for the UTC day containing `timestamp`. A new day opens with the levels the
 * protocol carries into it (open interest, last index print) and zeroed flows.
 */
export async function day(context: Context, timestamp: number, p: Protocol): Promise<DailySnapshot> {
  const n = dayOf(timestamp);
  return context.DailySnapshot.getOrCreate({
    id: n.toString(),
    day: n,
    date: BigInt(n * DAY),
    indexClose: p.latestPrice,
    longOpenInterest: p.longOpenInterest,
    tradeCount: 0,
    volumeHours: 0n,
    notionalVolume: 0n,
    fees: 0n,
    liquidations: 0,
    loansOpened: 0,
    principalLent: 0n,
  });
}
