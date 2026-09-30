import { indexer } from "envio";

import { day, eventId, protocol } from "../lib/store.js";
import { dayOf } from "../lib/units.js";

indexer.onEvent({ contract: "IngotIndex", event: "Published" }, async ({ event, context }) => {
  const { id, timestamp, price, sampleCount, sourceCount } = event.params;

  context.IndexPrint.set({
    id: id.toString(),
    printId: id,
    observedAt: timestamp,
    publishedAt: BigInt(event.block.timestamp),
    price,
    sampleCount: Number(sampleCount),
    sourceCount: Number(sourceCount),
    revoked: false,
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
  });

  const p = await protocol(context);
  const updated = { ...p, prints: p.prints + 1, latestPrice: price, latestObservedAt: timestamp };
  context.Protocol.set(updated);

  // Bucketed by observation time, not block time: a backfilled print belongs to the day it
  // describes, which is what makes the daily series line up with the index history.
  const d = await day(context, Number(timestamp), updated);
  context.DailySnapshot.set({ ...d, indexClose: price });
});

indexer.onEvent({ contract: "IngotIndex", event: "Revoked" }, async ({ event, context }) => {
  const { id, timestamp, price, reason } = event.params;

  context.Revocation.set({
    id: eventId(event),
    printId: id,
    observedAt: timestamp,
    price,
    reason,
    timestamp: BigInt(event.block.timestamp),
    txHash: event.transaction.hash,
  });

  const print = await context.IndexPrint.get(id.toString());
  if (print) context.IndexPrint.set({ ...print, revoked: true });

  // Only the tip is ever revoked, so the latest valid print is the one before it.
  const previous = id > 0n ? await context.IndexPrint.get((id - 1n).toString()) : undefined;
  const p = await protocol(context);
  const updated = {
    ...p,
    prints: p.prints - 1,
    revocations: p.revocations + 1,
    latestPrice: previous?.price,
    latestObservedAt: previous?.observedAt,
  };
  context.Protocol.set(updated);

  // The revoked print's day closes on whatever preceded it — unless that was a different day,
  // in which case the revoked print was the only one there and the day has no close.
  const d = await day(context, Number(timestamp), updated);
  const sameDay = previous !== undefined && dayOf(Number(previous.observedAt)) === d.day;
  context.DailySnapshot.set({ ...d, indexClose: sameDay ? previous.price : undefined });
});
