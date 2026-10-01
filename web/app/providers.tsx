"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

import { deploymentFor } from "@/lib/addresses";
import { LOCAL_CHAIN_ENABLED, anvil, monadTestnet } from "@/lib/chains";

/// Deployed chains first. With no wallet connected wagmi reports `chains[0]`, so ordering this way
/// means a visitor's reads hit a chain Ingot actually lives on. The local chain is only configured
/// at all when LOCAL_CHAIN_ENABLED — see lib/chains.ts for why that matters.
const available = LOCAL_CHAIN_ENABLED ? [monadTestnet, anvil] : [monadTestnet];
const CHAINS = [...available].sort(
  (a, b) => Number(!deploymentFor(a.id)) - Number(!deploymentFor(b.id)),
) as unknown as readonly [typeof monadTestnet, ...(typeof anvil)[]];

const config = createConfig({
  chains: CHAINS,
  connectors: [injected()],
  transports: Object.fromEntries(CHAINS.map((chain) => [chain.id, http()])) as Record<
    (typeof CHAINS)[number]["id"],
    ReturnType<typeof http>
  >,
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
      <QueryClientProvider client={queryClient}>
        {/* One reduced-motion policy for every animation, decided on the client so server and
            client render the same markup. */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
