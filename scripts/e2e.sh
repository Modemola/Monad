#!/usr/bin/env bash
#
# End-to-end test: deploy the whole stack to a fresh local chain, build the production front end
# against it, and drive the trade, credit and underwrite flows through a real browser.
#
#   ./scripts/e2e.sh
#
# Needs Foundry, Node, pnpm dependencies installed in web/, and a Chromium for Playwright
# (`cd web && pnpm exec playwright-core install chromium`, or set CHROMIUM_PATH).

set -euo pipefail
cd "$(dirname "$0")/.."

ANVIL_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
PORT="${E2E_PORT:-3200}"
pids=()
cleanup() { for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT

if cast chain-id --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; then
  echo "error: something is already listening on 8545; stop it so the test starts from a fresh chain" >&2
  exit 1
fi
anvil --silent &
pids+=($!)
until cast chain-id --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; do sleep 0.5; done

RPC_URL=http://127.0.0.1:8545 EXPECTED_CHAIN_ID=31337 DEPLOYER_PRIVATE_KEY=$ANVIL_KEY ./scripts/deploy.sh

# The production build, with the local chain switched on; the deploy above wrote its addresses.
( cd web && NEXT_PUBLIC_ENABLE_LOCAL_CHAIN=1 pnpm build )
node web/e2e/serve.mjs web/out "$PORT" &
pids+=($!)
until curl -s -o /dev/null "http://localhost:$PORT/"; do sleep 0.5; done

( cd web && BASE_URL="http://localhost:$PORT" node e2e/flows.mjs )
