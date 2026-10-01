"use client";

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { anvil, monadTestnet } from "@/lib/chains";
import { deploymentFor } from "@/lib/addresses";
import { shortAddress } from "@/lib/format";

const BASE = "gloss relative px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.18em] transition-colors duration-300";

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
      <button
        type="button"
        disabled={isPending || !injectedConnector}
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
        className={`${BASE} border border-gold bg-gold text-[#140e05] hover:bg-gold-soft disabled:opacity-40`}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  if (!supported || !deployed) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: monadTestnet.id })}
        className={`${BASE} border border-critical/60 text-critical hover:bg-critical/10`}
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
      className={`${BASE} tnum flex items-center gap-2 border border-hairline text-ink-secondary hover:border-gold/50 hover:text-ink`}
    >
      <span className="h-1.5 w-1.5 bg-good shadow-[0_0_10px_rgba(127,209,166,0.9)]" />
      {address ? shortAddress(address) : ""}
    </button>
  );
}
