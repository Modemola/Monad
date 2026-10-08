"use client";

import { useEffect, useState } from "react";
import { useAccount, useBlockNumber, useChainId } from "wagmi";

import { monadTestnet } from "@/lib/chains";
import { useDeployment } from "@/lib/useIngot";

type Provider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

/// Whether the connected wallet is really talking to the Monad testnet this app reads.
///
/// A wallet signs and sends through its own RPC for the network, not the app's. If its "Monad
/// Testnet" entry points at a stale or different node with the same chain id, a transaction "goes
/// through" there — calling an address with no contract simply succeeds and does nothing — and
/// never reaches Ingot. Nothing on the page would ever change. So ask the wallet itself whether it
/// can see Ingot's contracts, and how far its chain has got, and compare.
function useWalletSeesIngot() {
  const { connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { deployment } = useDeployment();
  const { data: ourBlock } = useBlockNumber({ chainId, query: { refetchInterval: 30_000 } });
  const [problem, setProblem] = useState<"no-contracts" | "behind" | null>(null);

  useEffect(() => {
    // Any chain Ingot is deployed on (the testnet, or a local chain in development).
    if (!isConnected || !connector || !deployment) {
      setProblem(null);
      return;
    }
    let stopped = false;
    const check = async () => {
      try {
        const provider = (await connector.getProvider()) as Provider;
        const [code, block] = await Promise.all([
          provider.request({ method: "eth_getCode", params: [deployment.usdc, "latest"] }),
          provider.request({ method: "eth_blockNumber" }),
        ]);
        if (stopped) return;
        if (code === "0x" || code === "0x0" || code === "") setProblem("no-contracts");
        else if (ourBlock !== undefined && typeof block === "string" && ourBlock - BigInt(block) > 10_000n) setProblem("behind");
        else setProblem(null);
      } catch {
        // A wallet that will not answer reads is not evidence of a wrong network.
      }
    };
    check();
    const timer = setInterval(check, 30_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [isConnected, connector, chainId, deployment, ourBlock]);

  return { problem, connector };
}

/// A banner under the navigation when the wallet's Monad Testnet is not the one Ingot lives on,
/// with the fix: point the wallet's network at the public RPC.
export function WalletNetworkCheck() {
  const { problem, connector } = useWalletSeesIngot();
  const [asked, setAsked] = useState(false);
  if (!problem) return null;

  const rpc = monadTestnet.rpcUrls.default.http[0];
  const addNetwork = async () => {
    setAsked(true);
    try {
      const provider = (await connector!.getProvider()) as Provider;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${monadTestnet.id.toString(16)}`,
            chainName: "Monad Testnet",
            nativeCurrency: monadTestnet.nativeCurrency,
            rpcUrls: [rpc],
            blockExplorerUrls: [monadTestnet.blockExplorers.default.url],
          },
        ],
      });
    } catch {
      // Declined, or the wallet does not let a site change an existing network: the manual steps
      // in the banner still apply.
    }
  };

  return (
    <div role="alert" className="fixed inset-x-0 top-16 z-[45] border-b border-critical/40 bg-[#1a0f0b]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-[12.5px] leading-relaxed text-ink-secondary">
          <span className="text-critical">Your wallet is on a different Monad Testnet node</span>
          {problem === "no-contracts" ? " that cannot see Ingot's contracts" : " that is far behind the live chain"}, so
          transactions you sign will not reach Ingot. In your wallet&apos;s network settings, set{" "}
          <span className="text-ink">Monad Testnet</span> (chain ID 10143) to use the RPC{" "}
          <span className="font-mono text-ink">{rpc}</span>, then reload this page.
        </p>
        <button
          type="button"
          onClick={addNetwork}
          className="shrink-0 border border-gold/60 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-gold transition-colors hover:bg-gold/10"
        >
          {asked ? "Check your wallet" : "Add the right RPC"}
        </button>
      </div>
    </div>
  );
}
