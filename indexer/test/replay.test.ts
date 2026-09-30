// Replays a session recorded from the real contracts and requires the indexer to agree with
// the chain, to the unit, at every checkpoint.
//
// The fixture is written by contracts/test/IndexerTrace.t.sol: real logs from real calls, plus
// what IngotMarket itself reports for every position and for open interest at each checkpoint.
// Nothing here is hand-computed, so a passing run means the TypeScript port of _applyDelta and
// the open-interest bookkeeping are exact — including for the vault, which emits nothing of its
// own and whose position the indexer can only derive.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createTestIndexer } from "envio";
import { decodeEventLog, type Abi, type Hex } from "viem";
import { describe, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const CHAIN = 10143;

type Contract = "IngotIndex" | "IngotMarket" | "UnderwriterVault" | "HedgedCredit";

interface Log {
  emitter: string;
  block: number;
  timestamp: number;
  topics: Hex[];
  data: Hex;
}

interface Checkpoint {
  label: string;
  block: number;
  seriesId: string;
  longOpenInterest: string;
  settled: boolean;
  settlementPrice: string;
  badDebt: string;
  prints: number;
  loanClosed: boolean;
  positions: { account: string; size: string; cost: string }[];
}

const trace = JSON.parse(readFileSync(resolve(ROOT, "test/fixtures/trace.json"), "utf8")) as {
  contracts: Record<Contract, string>;
  vault: string;
  logs: Log[];
  checkpoints: Checkpoint[];
};

const abis = Object.fromEntries(
  (Object.keys(trace.contracts) as Contract[]).map((name) => [
    name,
    JSON.parse(readFileSync(resolve(ROOT, `abis/${name}.json`), "utf8")) as Abi,
  ]),
) as Record<Contract, Abi>;

// Only what config.yaml subscribes to; share-token Transfers and admin events are skipped
// exactly as the live indexer would skip them.
const configured = (() => {
  const yaml = readFileSync(resolve(ROOT, "config.yaml"), "utf8");
  const events = new Map<Contract, Set<string>>();
  let current: Contract | undefined;
  for (const line of yaml.split("\n")) {
    const contract = line.match(/^ {2}- name: (\w+)$/);
    if (contract) {
      current = contract[1] as Contract;
      events.set(current, new Set());
    }
    const event = line.match(/^ {6}- event: (\w+)$/);
    if (event && current) events.get(current)!.add(event[1]!);
  }
  return events;
})();

const byAddress = new Map(
  (Object.entries(trace.contracts) as [Contract, string][]).map(([name, address]) => [
    address.toLowerCase(),
    name,
  ]),
);

/** Decode the recorded logs into the simulate items the test indexer accepts. */
function simulate(logs: Log[]) {
  const perBlock = new Map<number, number>();
  const items = [];

  for (const log of logs) {
    const contract = byAddress.get(log.emitter.toLowerCase());
    if (!contract) continue;

    const decoded = decodeEventLog({
      abi: abis[contract],
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data,
    });
    if (!decoded.eventName || !configured.get(contract)?.has(decoded.eventName)) continue;

    // viem returns small integers as numbers; the indexer's params are all bigint.
    const params = Object.fromEntries(
      Object.entries(decoded.args as unknown as Record<string, unknown>).map(([k, v]) => [
        k,
        typeof v === "number" ? BigInt(v) : v,
      ]),
    );

    const logIndex = perBlock.get(log.block) ?? 0;
    perBlock.set(log.block, logIndex + 1);

    items.push({
      contract,
      event: decoded.eventName,
      logIndex,
      block: { number: log.block, timestamp: log.timestamp },
      transaction: { hash: `0x${log.block.toString(16).padStart(64, "0")}` },
      params,
    });
  }

  // The simulate union is keyed per contract and event; the decoded items match it by
  // construction, which TypeScript cannot see through a dynamic ABI.
  return items as never[];
}

describe("replay of a recorded session", () => {
  it("matches the contracts at every checkpoint", async (t) => {
    const indexer = createTestIndexer();
    let from = 0;

    for (const checkpoint of trace.checkpoints) {
      const logs = trace.logs.filter((l) => l.block > from && l.block <= checkpoint.block);
      await indexer.process({
        chains: { [CHAIN]: { simulate: simulate(logs), endBlock: checkpoint.block } },
      });
      from = checkpoint.block;

      const at = `[${checkpoint.label}]`;
      const series = await indexer.Series.getOrThrow(checkpoint.seriesId);
      const protocol = await indexer.Protocol.getOrThrow("ingot");

      t.expect(series.longOpenInterest, `${at} series open interest`).toBe(
        BigInt(checkpoint.longOpenInterest),
      );
      t.expect(protocol.longOpenInterest, `${at} protocol open interest`).toBe(
        BigInt(checkpoint.longOpenInterest),
      );
      t.expect(series.settled, `${at} settled`).toBe(checkpoint.settled);
      if (checkpoint.settled) {
        t.expect(series.settlementPrice, `${at} settlement price`).toBe(
          BigInt(checkpoint.settlementPrice),
        );
      }
      t.expect(protocol.badDebt, `${at} bad debt`).toBe(BigInt(checkpoint.badDebt));
      t.expect(protocol.prints, `${at} live prints`).toBe(checkpoint.prints);

      for (const expected of checkpoint.positions) {
        const position = await indexer.Position.get(`${expected.account}-${checkpoint.seriesId}`);
        t.expect(
          { size: position?.size ?? 0n, cost: position?.cost ?? 0n },
          `${at} position of ${expected.account}`,
        ).toEqual({ size: BigInt(expected.size), cost: BigInt(expected.cost) });
      }

      const vault = await indexer.Position.get(`${trace.vault}-${checkpoint.seriesId}`);
      t.expect(series.vaultInventory, `${at} vault inventory`).toBe(vault?.size ?? 0n);

      const loans = await indexer.Loan.getAll();
      if (loans.length > 0) {
        t.expect(loans[0]!.status === "Closed", `${at} loan closed`).toBe(checkpoint.loanClosed);
      }
    }
  });

  it("keeps the revoked print on record and lets its id be reused", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({ chains: { [CHAIN]: { simulate: simulate(trace.logs) } } });

    const [revocation] = await indexer.Revocation.getAll();
    t.expect(revocation?.reason).toBe("single-venue outlier");
    t.expect(revocation?.price).toBe(4n * 10n ** 18n);

    // The next publish landed on the same id, so the row is live again and not the outlier.
    const reused = await indexer.IndexPrint.getOrThrow(revocation!.printId.toString());
    t.expect(reused.revoked).toBe(false);
    t.expect(reused.price).not.toBe(revocation!.price);

    const protocol = await indexer.Protocol.getOrThrow("ingot");
    t.expect(protocol.revocations).toBe(1);
    t.expect(protocol.vault).toBe(trace.vault);
  });

  it("builds the loan book from events alone", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({ chains: { [CHAIN]: { simulate: simulate(trace.logs) } } });

    const [loan] = await indexer.Loan.getAll();
    t.expect(loan?.status).toBe("Closed");
    t.expect(loan?.basisRatioBps).toBe(8_000);
    t.expect(loan?.offtakeHours).toBe(100_000n * 10n ** 18n);
    // The hedge is the offtake scaled by basis: 80% of 100,000 GPU-hours.
    t.expect(loan?.hedgeSize).toBe(80_000n * 10n ** 18n);
    t.expect(loan?.hedgePnl).toBeDefined();

    const protocol = await indexer.Protocol.getOrThrow("ingot");
    t.expect(protocol.loansOpen).toBe(0);
    t.expect(protocol.principalOutstanding).toBe(0n);
    t.expect(protocol.hedgePnlRealized).toBe(loan!.hedgePnl);

    const flows = await indexer.PoolFlow.getAll();
    t.expect(flows.map((f) => `${f.pool}:${f.kind}`).sort()).toEqual([
      "Credit:Deposit",
      "Credit:Redeem",
      "Underwriter:Deposit",
    ]);
  });
});
