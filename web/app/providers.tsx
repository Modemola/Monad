"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

import { deploymentFor } from "@/lib/addresses";
import { LOCAL_CHAIN_ENABLED, anvil, monadTestnet } from "@/lib/chains";
import { refreshInterval, staleTime } from "@/lib/refresh";

/// Deployed chains first. With no wallet connected wagmi reports `chains[0]`, so ordering this way
/// means a visitor's reads hit a chain Ingot actually lives on. The local chain is only configured
/// at all when LOCAL_CHAIN_ENABLED — see lib/chains.ts for why that matters — and in such a build
/// it comes first: a developer or the end-to-end test running against anvil means to read anvil,
/// not the public testnet deployment that is also in the address map.
const available = LOCAL_CHAIN_ENABLED ? [anvil, monadTestnet] : [monadTestnet];
const CHAINS = [...available].sort(
  (a, b) => Number(!deploymentFor(a.id)) - Number(!deploymentFor(b.id)),
) as unknown as readonly [typeof monadTestnet, ...(typeof anvil)[]];

/// WalletConnect reaches every mobile wallet (and desktop apps) by QR code or deep link. It needs a
/// free project id from https://cloud.reown.com; without one the option is simply not offered.
const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

/// Browser-extension wallets announce themselves (EIP-6963) and wagmi adds each as its own
/// connector, so Rabby, Phantom, OKX, Coinbase Wallet and the rest all show up by name next to
/// MetaMask. `injected()` stays as the fallback for wallets that only set `window.ethereum`, such
/// as the in-app browsers of mobile wallets.
const config = createConfig({
  chains: CHAINS,
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    ...(WALLETCONNECT_PROJECT_ID
      ? [
          walletConnect({
            projectId: WALLETCONNECT_PROJECT_ID,
            showQrModal: true,
            metadata: {
              name: "Ingot",
              description: "A cash-settled market for compute, and the credit layer it unlocks.",
              url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://monad-six-sooty.vercel.app",
              icons: [],
            },
          }),
        ]
      : []),
  ],
  transports: Object.fromEntries(CHAINS.map((chain) => [chain.id, http()])) as Record<
    (typeof CHAINS)[number]["id"],
    ReturnType<typeof http>
  >,
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  // Poll rather than subscribe, at the pace each value can actually change (lib/refresh.ts).
  // Polling stops while the tab is hidden, and a confirmed transaction refreshes everything.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchInterval: refreshInterval, staleTime } },
      }),
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* One reduced-motion policy for every animation, decided on the client so server and
            client render the same markup. */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
