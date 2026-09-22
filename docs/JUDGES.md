# Trying Ingot in five minutes

Everything below runs on **Monad testnet**. No real funds are involved and no account is needed —
just a browser wallet. There is no login and no password; the wallet is the credential.

**Live app:** _<!-- LIVE_URL -->_

## 1. Point a wallet at Monad testnet

| | |
|---|---|
| Network | Monad Testnet |
| Chain ID | `10143` |
| RPC | `https://testnet-rpc.monad.xyz` |
| Currency | MON |
| Explorer | `https://testnet.monadexplorer.com` |

One click at [faucet.monad.xyz/add-network](https://faucet.monad.xyz/add-network), or add it by
hand with the values above.

You do **not** need MON to look around — the app reads the live market before you connect
anything. You need a little to send a transaction: [faucet.monad.xyz](https://faucet.monad.xyz/).

## 2. Get test USDC

Connect your wallet, open **Terminal**, and the collateral panel offers **Get 250,000 test USDC**
when your balance is low. That mints from the test token; there is nothing to ask us for.

## 3. What to look at, in order

**Terminal** — the H100 rental index, published onchain. Every print carries the hash of the
methodology behind it, how many venue quotes it was built from, and how many venues. Hover the
chart. Then put 10 lots in the ticket: before you sign, it shows the mark, your actual fill, the
notional, the margin it locks, the fee, and the worst price the order can fill at — which the
contract enforces, not just the interface.

**Credit** — the part that does not exist elsewhere. Enter a 100,000 GPU-hour offtake, set your
realized rate to 55% of the index, post margin, and draw. The loan and its hedge open in the same
transaction.

Then drag the slider under the recovery chart. The blue line is what the lender recovers hedged —
it does not move. The orange line is the same loan unhedged, and it falls through the debt as the
rate drops. **Every point on that chart is a value `HedgedCredit.project()` returned.** The
browser cannot draw it without asking the chain.

**Underwrite** — the vault that takes the other side of every trade, its live inventory, and NAV
marked to market rather than at book.

## 4. Checking the claims

```bash
git clone https://github.com/Modemola/Monad && cd Monad
git submodule update --init --recursive
cd contracts && forge test
```

77 tests. The ones worth reading:

- `test_invariant_marketIsZeroSum` — total equity equals total deposits through opening, index
  moves, partial closes, flips, liquidation and settlement.
- `test_thesis_poolNavIsIndexInvariant` — credit pool NAV does not move when the index does.
- `test_backtest_walkForwardHedgedVersusUnhedged` — replays 78 days of real posted H100 rates
  through the real contracts. Run it with `-vv` to see the cohort table.

`docs/BACKTEST.md` reports what that data showed, including the result that went against us.
`docs/SECURITY.md` records the security review, including the three findings accepted rather than
fixed.

## Contract addresses

_<!-- ADDRESSES -->_

## Known limits, stated plainly

- Testnet. The USDC is a mock with an open mint, deliberately, so that you can try it.
- The index publisher is a single allowlisted key. Production needs a quorum; `docs/SECURITY.md`
  says so and says what it would take.
- The borrower's realized rate is asserted, not proven. Bounded, not verified — also in
  `docs/SECURITY.md`.
