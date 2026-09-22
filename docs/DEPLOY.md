# Deploying Ingot

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

Backfills 96 hourly index prints, lists the front-month contract, and capitalizes the underwriter
vault with 2,000,000 USDC and the credit pool with 1,000,000 USDC. The market is live once the
finality delay elapses.

## Verify it works

Against a local chain:

```bash
anvil &
export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
forge script script/Seed.s.sol   --rpc-url http://127.0.0.1:8545 --broadcast
cast rpc evm_increaseTime 120 && cast rpc evm_mine   # clear the finality delay
```

Then open a hedged loan and read the projection:

```bash
cast send $CREDIT 'open(uint256,uint256,uint256,uint256)' 0 100000000000000000000000 60000000000 0 \
  --private-key $DEPLOYER_PRIVATE_KEY --rpc-url http://127.0.0.1:8545
cast call $CREDIT 'project(uint256,uint256)(int256,uint256,uint256,uint256,uint256)' 0 800000000000000000 \
  --rpc-url http://127.0.0.1:8545
```

A run of this on a fresh chain produced a 100,000 GPU-hour loan hedged at $2.2474/hr, $158,382 of
principal against $166,301 of debt. Borrower resources came back as $224,743.74 at $0.80/hr,
$2.26/hr and $6.00/hr alike, and hedged recovery as $166,300.87 at all three, while unhedged
recovery at $0.80/hr was $140,000.

## Publishing the front end

The app is a static-friendly Next.js client with no backend and no secrets — it reads Monad
directly. Any Next host works; Vercel is the shortest path.

```bash
cd web
pnpm dlx vercel --prod
```

Root directory `web`, build command `pnpm build`, framework auto-detected as Next.js.

The one optional setting is `NEXT_PUBLIC_MONAD_RPC_URL`. Leave it unset and the app uses the
public `https://testnet-rpc.monad.xyz`, which is rate-limited and shared — fine for a judge
clicking through, worth replacing with a dedicated endpoint before a demo recording.

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
