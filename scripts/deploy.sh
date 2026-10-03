#!/usr/bin/env bash
#
# Deploy Ingot to Monad testnet and wire the front end to it.
#
#   ./scripts/deploy.sh
#
# Run this from the repo root on a machine that can reach Monad. It deploys the stack, seeds
# the index and both pools, points the front end at the result, and tells you what to commit.
# Safe to re-run: a fresh deployment simply replaces the recorded addresses.
#
# To rehearse the whole thing against a local node first:
#
#   anvil &
#   RPC_URL=http://127.0.0.1:8545 EXPECTED_CHAIN_ID=31337 \
#     DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
#     ./scripts/deploy.sh

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight

command -v forge >/dev/null || fail "forge not found. Install Foundry: https://getfoundry.sh"
command -v cast  >/dev/null || fail "cast not found. Install Foundry: https://getfoundry.sh"
command -v node  >/dev/null || fail "node not found (needed to sync front-end addresses)."

# Load contracts/.env *without* clobbering anything already set in the environment, so a
# rehearsal can point at a local node without editing the file. Sourcing it outright meant the
# file silently won over an explicit RPC_URL, which is the wrong way round. The file is optional
# when everything comes from the environment, which is how the GitHub deploy workflow runs it.
if [ -f contracts/.env ]; then
  while IFS='=' read -r key value; do
    case "$key" in ''|'#'*) continue ;; esac
    key="${key%%[[:space:]]*}"
    value="${value%\"}"; value="${value#\"}"
    if [ -z "${!key:-}" ]; then
      export "$key=$value"
    fi
  done < contracts/.env
elif [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  fail "contracts/.env not found. Copy contracts/.env.example and fill it in."
fi

RPC_URL="${RPC_URL:-${MONAD_TESTNET_RPC_URL:-}}"
EXPECTED_CHAIN_ID="${EXPECTED_CHAIN_ID:-10143}"

[ -n "$RPC_URL" ] || fail "set MONAD_TESTNET_RPC_URL in contracts/.env (or RPC_URL in the environment)"
: "${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY in contracts/.env}"

# Deploy.s.sol reads this; export so a local rehearsal uses the same value as the guard above.
export MONAD_TESTNET_RPC_URL="$RPC_URL"

DEPLOYER=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")
CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL")
BALANCE=$(cast balance "$DEPLOYER" --rpc-url "$RPC_URL")

say "Deploying as $DEPLOYER"
echo "  chain id   $CHAIN_ID"
echo "  balance    $(cast from-wei "$BALANCE") MON"

[ "$CHAIN_ID" = "$EXPECTED_CHAIN_ID" ] \
  || fail "expected chain $EXPECTED_CHAIN_ID, got $CHAIN_ID"
[ "$BALANCE" != "0" ] \
  || fail "deployer has no native balance. Fund $DEPLOYER at https://faucet.monad.xyz"

# Monad charges for a transaction's gas limit, not the gas it ends up using. Deploy, seed and the
# demonstration loan come to about 31M gas of limit (measured on a local rehearsal); with headroom,
# refuse to start on less than this, because running dry halfway through the seed leaves a market
# with contracts but no history and no capital.
DEPLOY_GAS=36000000
GAS_PRICE=$(cast gas-price --rpc-url "$RPC_URL")
NEEDED=$(node -e "console.log((BigInt('$DEPLOY_GAS') * BigInt('$GAS_PRICE')).toString())")
echo "  needs      ~$(cast from-wei "$NEEDED") MON at $(cast from-wei "$GAS_PRICE" gwei) gwei"
node -e "process.exit(BigInt('$BALANCE') >= BigInt('$NEEDED') ? 0 : 1)" \
  || fail "deployer holds $(cast from-wei "$BALANCE") MON; the deploy needs about $(cast from-wei "$NEEDED"). Top up $DEPLOYER at https://faucet.monad.xyz"

# ---------------------------------------------------------------- test first

say "Running the test suite before touching a network"
( cd contracts && forge test ) || fail "tests failed — not deploying"

# ---------------------------------------------------------------- deploy

say "Deploying contracts"
( cd contracts && forge script script/Deploy.s.sol \
    --rpc-url "$RPC_URL" --broadcast --slow ) \
  || fail "deploy failed"

say "Seeding index history, front contract and both pools"
( cd contracts && forge script script/Seed.s.sol \
    --rpc-url "$RPC_URL" --broadcast --slow ) \
  || fail "seed failed"

# The demonstration loan hedges at the mark, which needs a finalized print, so wait out the
# index's finality delay first. Not fatal: the market works without it; the credit desk just
# opens on an empty recovery panel until someone draws a loan.
INDEX=$(node -e "console.log(require('$ROOT/contracts/deployments/${CHAIN_ID}.json').index)")
DELAY=$(cast call "$INDEX" 'finalityDelay()(uint32)' --rpc-url "$RPC_URL" | awk '{print $1}')
say "Waiting ${DELAY}s for the seeded prints to finalize, then opening a demonstration loan"
sleep $((DELAY + 15))
# A local anvil only mines on transactions, so its clock stands still while we wait; mine one
# block to bring it forward. A live chain is producing blocks anyway.
if [ "$CHAIN_ID" = "31337" ]; then cast rpc evm_mine --rpc-url "$RPC_URL" >/dev/null; fi
( cd contracts && forge script script/Seed.s.sol --sig "openDemoLoan()" \
    --rpc-url "$RPC_URL" --broadcast --slow ) \
  || printf '\n\033[33mwarning:\033[0m the demonstration loan did not open; the deployment is still good.\n' >&2

# ---------------------------------------------------------------- wire the app

say "Pointing the front end at the deployment"
( cd web && node scripts/abis.mjs && node scripts/addresses.mjs )

say "Pointing the indexer at the deployment"
node indexer/scripts/sync.mjs

DEPLOYMENT="contracts/deployments/${CHAIN_ID}.json"
[ -f "$DEPLOYMENT" ] || fail "expected $DEPLOYMENT to exist after deploy"

say "Deployed"
cat "$DEPLOYMENT"

MARKET=$(node -e "console.log(require('$ROOT/$DEPLOYMENT').market)")
say "The market is live. Check the mark with:"
echo "    cast call $MARKET 'markPrice(uint256)(uint256)' 0 --rpc-url $RPC_URL"

say "Commit these so the deployed app knows where to look:"
echo "  git add $DEPLOYMENT web/lib/addresses.ts web/lib/abis.ts indexer/config.yaml indexer/abis"
echo "  git commit -m 'chore: record Monad testnet deployment'"
echo "  git push"
