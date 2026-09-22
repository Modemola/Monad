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
  testnet: true,
});

/// Local chain, for developing against `anvil` before a testnet deployment exists.
export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});
