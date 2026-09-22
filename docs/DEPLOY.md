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
