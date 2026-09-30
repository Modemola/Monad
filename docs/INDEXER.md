# The data layer, as an Envio HyperIndex indexer

*Sponsor bounty: Envio.*

## Why Ingot needs one

The contracts can answer "what is my position now?" cheaply. Everything a trader, lender or
judge actually asks next needs history, and the chain has no way to serve that:

- **What has the index done?** The terminal chart reads prints one RPC call at a time.
- **Who is on the other side, and how much?** The vault is the counterparty to every fill, but
  it never trades directly, so no event records its position. Its inventory and cost basis only
  exist as a consequence of everyone else's trades.
- **How has open interest moved?** The contract keeps the current figure and nothing else.
- **What does the loan book look like?** Principal outstanding, each loan's hedge ratio, and what
  the hedges earned when loans closed.
- **What was revoked, and why?** Revocation pops the tip, and the next print reuses its id, so the
  chain forgets the revoked print entirely.

`indexer/` is an Envio HyperIndex project that turns Ingot's events into a GraphQL API that
answers all of these.

## What it indexes

| Contract | Events | Becomes |
|---|---|---|
| `IngotIndex` | `Published`, `Revoked` | `IndexPrint` (the live print at each id), `Revocation` (append-only audit trail) |
| `IngotMarket` | `Traded`, `Liquidated`, `PositionSettled` | `Trade`, `Liquidation`, and `Position` for **both** sides of every fill, the vault included |
| | `SeriesListed`, `SeriesSettled` | `Series`: open interest, vault inventory, volume, fees |
| | `Deposited`, `Withdrawn`, `BadDebtAbsorbed`, `VaultSet` | `Account`: collateral, realized PnL, fees, penalties, bad debt |
| `HedgedCredit` | `LoanOpened`, `LoanClosed`, `LoanSeized` | `Loan`: offtake, basis ratio, hedge size and entry, principal, interest, outcome |
| | `LenderDeposited`, `LenderRedeemed` | `PoolFlow` |
| `UnderwriterVault` | `Deposited`, `Redeemed` | `PoolFlow` |

Plus two aggregates: `Protocol`, a singleton with the running totals, and `DailySnapshot`, one
row per UTC day with end-of-day open interest and index close, plus that day's volume, fees,
liquidations and lending.

`LoanOpened` was widened for this: it now carries `offtakeHours`, `basisRatioBps`, `interest`
and `maturity`, so the loan book is rebuilt from logs with no storage read per loan.
`test_open_eventCarriesTheFullLoan` pins the event to the stored loan.

## Deriving the vault's side, exactly

Every fill moves the trader by `size` and the vault by `-size`, at the same price. The indexer
holds both positions by running `src/lib/units.ts`, a line-for-line port of
`IngotMarket._applyDelta`. Size, cost basis and realized PnL come out as the contract computes
them. BigInt division truncates toward zero exactly like Solidity's, so the port matches to the
unit, not approximately. Open interest is kept the way `_syncOpenInterest` keeps it: the sum of
every positive position, the vault's included.

As a runtime self-check, each `Traded` handler compares its own realized PnL for the trader with
the `realizedPnl` the contract emitted, and logs an error on any mismatch. A mismatch can only
mean a missed event.

## How it is proven

A port is only worth trusting if it has been checked against the original. So:

1. `contracts/test/IndexerTrace.t.sol` drives a realistic session through the **real contracts**:
   - underwriters and lenders fund the pools;
   - trades open a position, reduce it, and flip it through zero;
   - two fills land in one block;
   - a provisional print is revoked and its id reused;
   - a hedged loan opens at a 0.8 basis ratio;
   - a levered long is liquidated into bad debt;
   - the series settles and the loan closes.

   It records every log with its block. At three checkpoints it also records what the contract
   itself reports: every position's size and cost, open interest, bad debt, print count and loan
   status. All of it goes to `indexer/test/fixtures/trace.json`.
2. `indexer/test/replay.test.ts` decodes those logs with the committed ABIs and feeds them
   through the handlers with Envio's `createTestIndexer`. It needs no network, Docker or
   database. At each checkpoint, the indexed state must equal the contract's to the unit.

Nothing in the expected values is hand-computed. Two deliberate breakages confirm the test has
teeth:
- adding 1 to the cost removed on a reduce fails at the first checkpoint;
- adding one wei to the recorded open interest fails at the second.

CI keeps the fixture honest. The contracts job regenerates the trace, both copies of the ABIs,
and the indexer's addresses, then fails on any diff. A contract change that alters an event, or
the accounting, therefore cannot pass CI without the indexer being updated to match.

## Running it

```bash
cd indexer
pnpm install
pnpm codegen      # types from config.yaml + schema.graphql
pnpm test         # replay + unit tests, fully offline
pnpm dev          # run against Monad testnet via HyperSync (needs Docker + ENVIO_API_TOKEN)
```

`config.yaml` refers to events by name against `abis/*.json`, which are extracted from the Foundry
build. An event's signature can only change in Solidity. `scripts/sync.mjs` refreshes the ABIs,
and rewrites the chain's addresses and `start_block` from `contracts/deployments/10143.json`.
`scripts/deploy.sh` runs it, so a deployment updates the web app and the indexer together.

## Hosting

Envio's hosted service builds straight from the repository:

1. Deploy the contracts (`./scripts/deploy.sh`) and push the resulting `indexer/config.yaml`.
   It now carries the real addresses and deploy block.
2. In Envio's hosted service, connect this GitHub repository with the indexer directory set to
   `indexer/`, config `config.yaml`, branch `main`.
3. Copy the GraphQL endpoint it gives you into the web app's `NEXT_PUBLIC_INDEXER_URL`.

## Example queries

Open interest and volume, day by day:

```graphql
query {
  DailySnapshot(order_by: { day: asc }) {
    date
    longOpenInterest
    notionalVolume
    indexClose
  }
}
```

The vault's book, per series:

```graphql
query {
  Series {
    seriesId
    expiry
    vaultInventory
    longOpenInterest
    settled
    settlementPrice
  }
}
```

The loan book, with how each hedge performed:

```graphql
query {
  Loan(order_by: { loanId: desc }) {
    loanId
    borrower_id
    basisRatioBps
    hedgeSize
    hedgeEntryPrice
    principal
    status
    hedgePnl
    netOwed
  }
}
```

Every revocation, with its reason:

```graphql
query {
  Revocation(order_by: { timestamp: desc }) {
    printId
    price
    reason
    timestamp
  }
}
```
