# Deploying Ingot

## From GitHub, with no local setup

If your machine can't reach Monad, or you'd rather not install Foundry, let GitHub Actions do it:

1. Add a repository secret named `DEPLOYER_PRIVATE_KEY` (Settings → Secrets and variables →
   Actions → New repository secret) holding a throwaway testnet key funded from
   <https://faucet.monad.xyz>. The scheduled index publisher uses the same secret.
2. Open the **Actions** tab, pick **Deploy to Monad testnet**, and press **Run workflow**.
3. When the run finishes, its summary shows the addresses and an **open the pull request** link.
   Merge that pull request, and the live site and indexer point at the new contracts.

The workflow runs `scripts/deploy.sh`, exactly as below: tests first, then deploy, seed, and sync
the web app and indexer. The results land on a `deploy/monad-testnet-<run>` branch, never on
`main` directly.

## Prerequisites

Foundry, and a `contracts/.env` with:

```
MONAD_TESTNET_RPC_URL=https://testnet-rpc.monad.xyz
DEPLOYER_PRIVATE_KEY=0x...
```

The deployer is a throwaway testnet key. Never point these scripts at a key holding real value.

## Deploy

```bash
cd contracts
set -a && . ./.env && set +a
forge script script/Deploy.s.sol --rpc-url $MONAD_TESTNET_RPC_URL --broadcast
```

Deploys the index, market, underwriter vault and credit pool, wires them together, and writes
every address to `deployments/<chainid>.json`. A mock six-decimal USDC is deployed and left
mintable unless `USDC_ADDRESS` is set — judges need to be able to get test funds.

Testnet deployments set the index finality delay to 60 seconds so the market is usable a minute
after seeding. Mainnet would run the one-hour default.

## Seed

```bash
forge script script/Seed.s.sol --rpc-url $MONAD_TESTNET_RPC_URL --broadcast
```

Backfills the real index history — one print a day for the 78 days in
`contracts/data/h100_index.csv`, the same series the landing page charts and
[BACKTEST.md](BACKTEST.md) analyses — lists the front-month contract, and capitalizes the underwriter
vault with 2,000,000 USDC and the credit pool with 1,000,000 USDC. The market is live once the
finality delay elapses. `deploy.sh` then waits out that delay and runs
`forge script script/Seed.s.sol --sig "openDemoLoan()"`, which opens one 100,000 GPU-hour hedged
loan from the deployer, so the credit desk's recovery profile is read from a real loan on chain
from the first visit. The scheduled publisher then continues the series every six hours from the
last real level; every backfilled move, and the step to the first live print, sits inside the
index's 25% deviation guard (`contracts/test/SeedHistory.t.sol` proves the backfill against the
production guards).

## Verify it works

Against a local chain:

```bash
anvil &
export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
forge script script/Seed.s.sol   --rpc-url http://127.0.0.1:8545 --broadcast
cast rpc evm_increaseTime 120 && cast rpc evm_mine   # clear the finality delay
```

Then open a hedged loan and read the projection. The seed leaves the deployer no spare USDC, so
mint the borrower's margin first (the mock has an open mint):

```bash
CREDIT=$(jq -r .hedgedCredit deployments/31337.json); USDC=$(jq -r .usdc deployments/31337.json)
ME=$(cast wallet address --private-key $DEPLOYER_PRIVATE_KEY); RPC=http://127.0.0.1:8545
cast send $USDC 'mint(address,uint256)' $ME 60000000000 --private-key $DEPLOYER_PRIVATE_KEY --rpc-url $RPC
cast send $USDC 'approve(address,uint256)' $CREDIT 60000000000 --private-key $DEPLOYER_PRIVATE_KEY --rpc-url $RPC
# series 0, 100,000 GPU-hours, sells at 100% of the index, 60,000 USDC margin, no fill bound
cast send $CREDIT 'open(uint256,uint256,uint16,uint256,uint256)' 0 100000000000000000000000 10000 60000000000 0 \
  --private-key $DEPLOYER_PRIVATE_KEY --rpc-url $RPC
cast call $CREDIT 'project(uint256,uint256)(int256,uint256,uint256,uint256,uint256)' 0 800000000000000000 \
  --rpc-url $RPC
```

A run of this on a fresh chain, seeded with the real history (last print $3.5950), produced a
100,000 GPU-hour loan hedged at $3.5681/hr: $251,652 of principal against $264,234 of debt.
Hedged borrower resources came back as $356,806.10 at $0.80/hr, $1.20/hr, $3.60/hr and $6.00/hr
alike, and hedged recovery as $264,234.24 at all four, while unhedged recovery was $140,000 at
$0.80/hr and $180,000 at $1.20/hr.

## Publishing the front end

The app is a static-friendly Next.js client with no backend and no secrets — it reads Monad
directly. Any Next host works; Vercel is the shortest path.

The app builds to a static export (`output: "export"`), and `vercel.json` at the repository root
tells Vercel how to build and serve it. **No project settings need changing:** Root Directory can be
left at the repository root, and it also still works if set to `web`, where Vercel's own Next.js
preset takes over.

Two optional settings:

- `NEXT_PUBLIC_MONAD_RPC_URL`. Leave it unset and the app uses the public
  `https://testnet-rpc.monad.xyz`, which is rate-limited and shared — fine for a judge clicking
  through, worth replacing with a dedicated endpoint before a demo recording.
- `NEXT_PUBLIC_INDEXER_URL`, the GraphQL endpoint of the hosted Envio indexer
  ([`INDEXER.md`](INDEXER.md#hosting)). It adds the trade tape and vault inventory to the
  terminal and the loan book to the credit desk. Leave it unset and those cards are omitted;
  everything else reads the contracts directly. It is baked in at build time, so redeploy
  after setting it.

### If the hosted URL shows `404 NOT_FOUND`

Vercel's own 404 page — not the app's — means the deployment built nothing it could serve.

**Check which branch production serves.** The `*.vercel.app` production URL serves the project's
production branch, `main` by default. If `main` does not contain `web/` and `vercel.json`, Vercel
deploys the repository as plain files, finds no `index.html`, and reports the deployment as a
*success* — so the dashboard shows green while the site 404s. Either merge the app into `main`, or
Settings → Environments → Production → Branch Tracking → point it at the branch that has it.

You can confirm what Vercel built for any commit without opening Vercel: the GitHub commit status
it posts names the deployment. Settings changes do not apply to existing deployments — redeploy.

Addresses are compiled into the bundle by `scripts/addresses.mjs`, so **redeploying the contracts
means rebuilding the front end.** Run the sync, commit, and let the host rebuild:

```bash
node scripts/abis.mjs && node scripts/addresses.mjs
git add ../contracts/deployments lib/addresses.ts lib/abis.ts
```

## After deploying

1. Commit `contracts/deployments/<chainid>.json`, `web/lib/addresses.ts` and `web/lib/abis.ts`.
   The app cannot find the contracts without them.
2. Fill [JUDGES.md](JUDGES.md)'s two placeholders — `<!-- LIVE_URL -->` with the hosted app,
   `<!-- ADDRESSES -->` with the contents of the deployment JSON.
3. Open the app in a clean browser profile with no wallet connected and confirm the index chart,
   the front contract and the vault all render. That is what a judge sees first, and it is the
   fastest check that the address sync actually happened.
4. Mint test USDC from the collateral panel and put one small trade through, so the seeded market
   has at least one real fill in its history.
