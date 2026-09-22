"use client";

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { anvil, monadTestnet } from "@/lib/chains";
import { deploymentFor } from "@/lib/addresses";
import { shortAddress } from "@/lib/format";

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
        className="rounded bg-ink px-3 py-1.5 text-[13px] font-medium text-plane transition-opacity hover:opacity-90 disabled:opacity-40"
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
        className="rounded border border-critical/40 bg-critical/10 px-3 py-1.5 text-[13px] text-critical"
      >
        Switch to Monad Testnet
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => disconnect()}
      title="Disconnect"
      className="tnum rounded border border-hairline px-3 py-1.5 text-[13px] text-ink-secondary transition-colors hover:border-axis hover:text-ink"
    >
      {address ? shortAddress(address) : ""}
    </button>
  );
}
