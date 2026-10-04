# Trying Ingot in five minutes

Everything below runs on **Monad testnet**. No real funds are involved and no account is needed —
just a wallet: any EVM browser extension (MetaMask, Rabby, Phantom, OKX, Coinbase Wallet…), or on a
phone, a wallet app's built-in browser. There is no login and no password; the wallet is the
credential.

**Live app:** <https://monad-six-sooty.vercel.app>

## 1. Point a wallet at Monad testnet

| | |
|---|---|
| Network | Monad Testnet |
| Chain ID | `10143` |
| RPC | `https://testnet-rpc.monad.xyz` |
| Currency | MON |
| Explorer | `https://testnet.monadscan.com` |

One click at [faucet.monad.xyz/add-network](https://faucet.monad.xyz/add-network), or add it by
hand with the values above.

You do **not** need MON to look around — the app reads the live market before you connect
anything. You need a little to send a transaction: [faucet.monad.xyz](https://faucet.monad.xyz/).

## 2. Get test USDC

Connect your wallet, open **Trade**, and the collateral panel offers **Get 250,000 test USDC**
when your balance is low. That mints from the test token; there is nothing to ask us for.

## 3. What to look at, in order

**Overview** — the landing page tells the story with real data: 78 days of posted H100 rates,
60% annualised volatility, and a 6x spread between providers on the same day. A scroll-driven 3D
scene raises eight providers' prices as gold columns and settles the index through them as a plane
of light; an animated sequence diagram shows the four things `HedgedCredit.open()` does inside one
transaction; and an interactive chart sweeps the hedged-versus-unhedged recovery case. The gold
bar in the hero, stamped with its hallmark, is rendered in real time. On a machine without a GPU
the 3D scenes give way to drawn versions rather than a frozen page (`?3d=on` forces them).

**Trade** — the H100 rental index, published onchain. Every print carries the hash of the
methodology behind it, how many venue quotes it was built from, and how many venues. The chart
starts with the real 78-day history the deploy backfilled — the same series the overview and the
backtest use — and the scheduled publisher extends it every six hours. Hover the chart. Then put 10 lots in the ticket: before you sign, it shows the mark, your actual
fill, the notional, the margin it locks, the fee, and the worst price the order can fill at — which
the contract enforces, not just the interface. A toast follows the transaction from signature to
block, with a MonadScan link; if the contract refuses, it says why in plain words. The position
card then shows entry, mark, health and an estimated liquidation price, with one button to close.

**Credit** — the part that does not exist elsewhere. Press **Example** for a 100,000 GPU-hour
offtake, set your realized rate to 55% of the index, press **Minimum** on the margin, and draw. The loan and its hedge open in the same
transaction.

Then drag the slider under the recovery chart. The gold line is what the lender recovers hedged —
it does not move. The ember-red line is the same loan unhedged, and it falls through the debt as the
rate drops; the shaded gap between them is the shortfall the hedge prevents. **Every point on that chart is a value `HedgedCredit.project()` returned.** The
browser cannot draw it without asking the chain.

**Underwrite** — the vault that takes the other side of every trade, its live inventory, and NAV
marked to market rather than at book.

## 4. Checking the claims

```bash
git clone https://github.com/Modemola/Monad && cd Monad
git submodule update --init --recursive
cd contracts && forge test
```

116 tests. The ones worth reading:

- `test_invariant_marketIsZeroSum` — total equity equals total deposits through opening, index
  moves, partial closes, flips, liquidation and settlement.
- `test_thesis_poolNavIsIndexInvariant` — credit pool NAV does not move when the index does.
- `test_backtest_walkForwardHedgedVersusUnhedged` — replays 78 days of real posted H100 rates
  through the real contracts. Run it with `-vv` to see the cohort table.
- `SeedHistory.t.sol` — the deploy seeds the real 78-day index history, not a made-up series;
  this proves every print clears the index's production guards and the live publisher continues
  from the last real level.
- `scripts/e2e.sh` — deploys the whole stack to a fresh local chain, builds the production front
  end against it, and drives a browser through all three flows: mint, deposit and go long on the
  terminal; draw a hedged loan; deposit into and redeem from the vault. It runs on every push.
- `IndexerTrace.t.sol` + `indexer/test/replay.test.ts`: a session recorded from the real
  contracts is replayed through the Envio indexer (`cd indexer && pnpm install && pnpm codegen &&
  pnpm test`). Every position, cost basis and open-interest figure, the vault's included, must
  match the chain to the unit. See `docs/INDEXER.md`.
- `IngotIndexReceiver.t.sol`: decodes a report produced by the Chainlink CRE workflow's own
  TypeScript encoder, so the oracle and the contract are proven to agree on the wire format. See
  `docs/ORACLE.md`.

`docs/BACKTEST.md` reports what that data showed, including the result that went against us.
`docs/SECURITY.md` records the security review, including the three findings accepted rather than
fixed.

## Contract addresses

Monad testnet (chain 10143), deployed from block 68,070,599. The same addresses are in
`contracts/deployments/10143.json`.

| Contract | Address |
|---|---|
| IngotIndex — the rental-rate oracle | [`0xaD065A9D41092f371A83f730B3b375D171a066AC`](https://testnet.monadscan.com/address/0xaD065A9D41092f371A83f730B3b375D171a066AC) |
| IngotIndexReceiver — Chainlink CRE landing pad | [`0xEcD7c0ECf2093415dEC999379e631002d637D254`](https://testnet.monadscan.com/address/0xEcD7c0ECf2093415dEC999379e631002d637D254) |
| IngotMarket — swaps, margin, settlement | [`0x5811068aEb4037A7690D28387E29Fe0c4f90b820`](https://testnet.monadscan.com/address/0x5811068aEb4037A7690D28387E29Fe0c4f90b820) |
| UnderwriterVault — takes the other side | [`0x7D8fb842ca5dC152854ED535B4b0C0e3b2ca82Ae`](https://testnet.monadscan.com/address/0x7D8fb842ca5dC152854ED535B4b0C0e3b2ca82Ae) |
| HedgedCredit — loans with the hedge built in | [`0xcd7a1B8Fd9c67dAC3a97443c77199930eb6334D9`](https://testnet.monadscan.com/address/0xcd7a1B8Fd9c67dAC3a97443c77199930eb6334D9) |
| MockUSDC — open-mint test collateral | [`0xe841dF0566e532822c50997e3084eF6fFB58ca5D`](https://testnet.monadscan.com/address/0xe841dF0566e532822c50997e3084eF6fFB58ca5D) |
| Deployer, owner and index publisher (testnet key) | [`0x694277D5e6af85Cb892B11ED6bd47b567e81FBa1`](https://testnet.monadscan.com/address/0x694277D5e6af85Cb892B11ED6bd47b567e81FBa1) |

## Known limits, stated plainly

- Testnet. The USDC is a mock with an open mint, deliberately, so that you can try it.
- The index publisher is a single allowlisted key. Production needs a quorum; `docs/SECURITY.md`
  says so and says what it would take.
- The borrower's realized rate is asserted, not proven. Bounded, not verified — also in
  `docs/SECURITY.md`.
