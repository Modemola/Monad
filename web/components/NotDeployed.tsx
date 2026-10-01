"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useAccount } from "wagmi";

import { usableDeployments } from "@/lib/addresses";
import { IngotMark } from "./Nav";

/// What a visitor sees when there is nothing to read.
///
/// Two different situations used to share one message. If Ingot is deployed somewhere and the
/// wallet is on another chain, the fix is to switch. If Ingot is not deployed anywhere this build
/// can reach, telling someone to switch networks sends them after a problem they do not have.
export function NotDeployed() {
  const { isConnected } = useAccount();
  const deployedSomewhere = usableDeployments().length > 0;

  const title = deployedSomewhere ? "Wrong network" : "Contracts not deployed yet";
  const body = deployedSomewhere
    ? isConnected
      ? "Your wallet is on a network Ingot is not deployed to. Switch to Monad testnet."
      : "Connect a wallet on Monad testnet to trade."
    : "This build of Ingot has no contract addresses for Monad testnet yet. Nothing is wrong with your wallet or network — the deployment step has not run.";

  return (
    <div className="glass relative mx-auto max-w-2xl overflow-hidden rounded-[32px] px-8 py-16 text-center">
      <div className="pointer-events-none absolute left-1/2 top-10 h-64 w-64 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(243,198,111,0.28),rgba(139,108,255,0.12)_45%,transparent_70%)] blur-2xl" />
      <div className="relative z-[2]">
        <motion.div
          className="mx-auto flex h-24 w-24 items-center justify-center"
          animate={{ y: [0, -10, 0], rotate: [0, 2, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <IngotMark size={88} />
        </motion.div>
        <h2 className="mt-6 font-display text-[40px] leading-tight text-chrome">{title}</h2>
        <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed text-ink-secondary">{body}</p>
        <Link
          href="/"
          className="gloss mt-8 inline-flex rounded-full border border-white/[0.14] bg-white/[0.05] px-5 py-2.5 text-[13.5px] text-ink backdrop-blur-xl transition-colors hover:border-white/[0.28]"
        >
          ← Back to the overview
        </Link>
      </div>
    </div>
  );
}
