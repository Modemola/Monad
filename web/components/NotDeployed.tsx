"use client";

import { useAccount } from "wagmi";

import { usableDeployments } from "@/lib/addresses";
import { Card, Empty } from "./ui";

/// What a visitor sees when there is nothing to read.
///
/// Two different situations used to share one message. If Ingot is deployed somewhere and the
/// wallet is on another chain, the fix is to switch. If Ingot is not deployed anywhere this build
/// can reach, telling someone to switch networks sends them after a problem they do not have.
export function NotDeployed() {
  const { isConnected } = useAccount();
  const deployedSomewhere = usableDeployments().length > 0;

  if (!deployedSomewhere) {
    return (
      <Card title="Contracts not deployed yet">
        <Empty>
          This build of Ingot has no contract addresses for Monad testnet yet. Nothing is wrong with
          your wallet or network — the deployment step has not run.
        </Empty>
      </Card>
    );
  }

  return (
    <Card title="Wrong network">
      <Empty>
        {isConnected
          ? "Your wallet is on a network Ingot is not deployed to. Switch to Monad testnet."
          : "Connect a wallet on Monad testnet to trade."}
      </Empty>
    </Card>
  );
}
