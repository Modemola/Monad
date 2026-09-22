"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

import { DEPLOYMENTS } from "@/lib/addresses";
import { anvil, monadTestnet } from "@/lib/chains";

/// Deployed chains first. With no wallet connected wagmi reports `chains[0]`, so ordering
/// this way means a visitor's reads hit a chain Ingot actually lives on — the live market
/// renders before anyone touches a wallet, and local development points at anvil without
/// a config switch.
const CHAINS = [monadTestnet, anvil].sort((a, b) => {
  const deployed = (id: number) => (DEPLOYMENTS[id] ? 0 : 1);
  return deployed(a.id) - deployed(b.id);
}) as unknown as readonly [typeof monadTestnet, typeof anvil];

const config = createConfig({
  chains: CHAINS,
  connectors: [injected()],
  transports: {
    [monadTestnet.id]: http(),
    [anvil.id]: http(),
  },
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  // Poll rather than subscribe: Monad finalizes in under a second, so a short
  // interval keeps marks live without a websocket to babysit.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchInterval: 2_000, staleTime: 1_000 } },
      }),
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
