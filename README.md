# Ingot

**A cash-settled market for compute, and the credit layer it unlocks.**

Built for Metropolis — Onchain Finance & Trading track. Deployed on Monad.

---

## The problem

Compute is one of the most valuable commodities in the world and it trades like a private
handshake. NVIDIA H100 rentals have been observed between **$0.72 and $15.14 per GPU-hour on the
same day** across two dozen marketplaces. There is no forward curve, no hedge, and almost no
secondary market — publicly documented secondary GPU transactions total roughly **$26.3M**.

That missing hedge has a price, and it lands on credit. CoreWeave borrows at **+225bps against a
hyperscaler counterparty and +450–550bps against a weaker one — on identical hardware.** The
spread is not hardware risk. It is unhedgeable cash-flow risk, and it is repriced on tens of
billions of dollars of GPU-backed debt.

On **October 5, 2026**, CME lists Silicon Data H100 and B200 Rental Index futures: 730 GPU-hours
per contract, financially settled. Compute is now, officially, a commodity. But that contract is
NYMEX-cleared, FCM-gated and US-regulated — closed to the neoclouds, brokers and AI startups who
actually carry the exposure, across 40+ countries.

## What Ingot is

1. **An index.** An onchain rental-rate index for a standardized compute unit, published with its
   methodology hash, sample count and venue count on every print. Prints are provisional before
   they are settleable, so a bad scrape can be revoked before money moves against it.
2. **A market.** Cash-settled swaps on that index, in CME-parity 730 GPU-hour lots, with liquidity
   underwritten by a vault rather than by hope.
3. **A margin engine** that marks continuously against the index instead of once a day — which is
   only economical at Monad's sub-cent gas and 800ms finality.
4. **Hedged credit.** The part that does not exist anywhere, onchain or off: a loan against compute
   revenue where the offsetting hedge is opened *at origination*, so the lender underwrites a fixed
   cash flow instead of a GPU price forecast. The hedge is not a separate product the borrower has
   to go buy — it is part of the loan.

## Repository layout

```
contracts/      Foundry workspace — index, market, vault, credit
  src/          Contracts
  test/         Test suite
  script/       Deployment and seeding
web/            Next.js front end — terminal, credit desk, underwriter vault
docs/hackathon/ Track briefs, resource index, build plan
```

## Running the front end

```bash
cd web
pnpm install
node scripts/abis.mjs        # regenerate ABIs after a contract change
node scripts/addresses.mjs   # pick up contracts/deployments/<chainid>.json
pnpm dev
```

With no wallet connected the app reads the first chain it is deployed to, so the market renders
before anyone connects.

## Status

| Component | State |
|---|---|
| `IngotIndex` — index oracle | Built, 19 tests passing |
| `IngotMarket` — swaps, margin, settlement, liquidation | Built, 23 tests passing |
| `UnderwriterVault` — LP accounting over the vault account | Built, 11 tests passing |
| `HedgedCredit` — loans with auto-hedge | Built, 16 tests passing |
| Front end — terminal, credit desk, underwriter vault | Built, builds clean |
| Backtest over historical rental data | Next |

## The number that makes the case

A 100,000 GPU-hour monthly offtake, hedged at $2.48/hr, financed at 70% LTV — $175,000 of
principal, $183,750 of debt, $60,000 of borrower margin. Recovery by settlement price, straight
out of `HedgedCredit.project()`:

| Settlement rate | Hedged recovery | Unhedged recovery |
|---|---|---|
| $0.80/hr | $183,750 | $140,000 |
| $1.20/hr | $183,750 | $180,000 |
| $1.80/hr and above | $183,750 | $183,750 |

At $0.80/hr the unhedged lender is down $43,750 — a quarter of the principal. That is not a
contrived stress case: H100 listings have been observed between $0.72 and $15.14 per GPU-hour on
the same day.

Reproduce it with `forge test --match-test test_demo_projectionTable -vv`.

## Local development

Foundry and solc are pinned; the index oracle builds and tests offline.

```bash
cd contracts
forge build
forge test
```
