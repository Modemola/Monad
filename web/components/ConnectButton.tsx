"use client";

import { motion } from "motion/react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { anvil, monadTestnet } from "@/lib/chains";
import { deploymentFor } from "@/lib/addresses";
import { shortAddress } from "@/lib/format";

const PILL = "gloss relative rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-300";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();

  const injectedConnector = connectors[0];
  const supported = chainId === monadTestnet.id || chainId === anvil.id;
  const deployed = deploymentFor(chainId) !== undefined;

  if (!isConnected) {
    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        disabled={isPending || !injectedConnector}
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
        className={`${PILL} bg-gradient-to-b from-white to-[#cfd7f5] text-[#0a0d1c] shadow-[0_8px_24px_-8px_rgba(180,200,255,0.7),inset_0_1px_0_rgba(255,255,255,0.9)] hover:shadow-[0_10px_32px_-6px_rgba(180,200,255,0.9),inset_0_1px_0_rgba(255,255,255,0.9)] disabled:opacity-40`}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </motion.button>
    );
  }

  if (!supported || !deployed) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: monadTestnet.id })}
        className={`${PILL} border border-critical/40 bg-critical/10 text-critical hover:bg-critical/20`}
      >
        Switch to Monad
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => disconnect()}
      title="Disconnect"
      className={`${PILL} tnum flex items-center gap-2 border border-white/[0.1] bg-white/[0.05] font-mono text-ink-secondary hover:border-white/[0.2] hover:text-ink`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-good shadow-[0_0_10px_rgba(62,230,168,0.9)]" />
      {address ? shortAddress(address) : ""}
    </button>
  );
}
