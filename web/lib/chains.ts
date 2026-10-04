import { defineChain } from "viem";

/// Monad testnet. Chain id and RPC from docs.monad.xyz; explorer is MonadScan.
export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz"],
    },
  },
  blockExplorers: {
    default: { name: "MonadScan", url: "https://testnet.monadexplorer.com" },
  },
  // The canonical Multicall3. With it, wagmi folds every read made in the same tick into one
  // eth_call; without it, each value on a page was its own request to a rate-limited public RPC.
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 251_449 },
  },
  blockTime: 400,
  testnet: true,
});

/// Local chain, for developing against `anvil` before a testnet deployment exists.
export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  // scripts/deploy.sh places a Multicall3 at the canonical address on a local chain, so local
  // runs batch reads exactly as the testnet does.
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 0 } },
  testnet: true,
});

/// Whether the local chain exists at all in this build.
///
/// Anvil lives on the developer's own machine. In a production bundle it must not be reachable:
/// a visitor's browser would try to read from *their* 127.0.0.1, fail, and render every figure as
/// a dash. That is exactly what happened once a local rehearsal's addresses were committed and
/// the deployed-chains-first ordering put anvil at the front. Next inlines both of these at build
/// time, so a production build never configures, orders or falls back to the local chain.
///
/// Note the claim is behavioural. The chain *definition* above is still in the bundle, because the
/// generated address map keys on `anvil.id` — so grepping the output for 127.0.0.1 will find it.
/// What was verified is that a production build makes no request to it: a browser session across
/// all three pages recorded zero outbound requests.
export const LOCAL_CHAIN_ENABLED =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_LOCAL_CHAIN === "1";
