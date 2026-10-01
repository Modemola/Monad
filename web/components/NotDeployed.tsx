"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useAccount } from "wagmi";

import { usableDeployments } from "@/lib/addresses";
import { IngotMark } from "./Nav";
import { Hallmarks } from "./ui";

/// What a visitor sees when there is nothing to read.
///
/// Two different situations used to share one message. If Ingot is deployed somewhere and the
/// wallet is on another chain, the fix is to switch. If Ingot is not deployed anywhere this build
/// can reach, telling someone to switch networks sends them after a problem they do not have.
export function NotDeployed() {
  const { isConnected } = useAccount();
  const deployedSomewhere = usableDeployments().length > 0;

  const title = deployedSomewhere ? "Wrong network" : "The foundry is cold";
  const body = deployedSomewhere
    ? isConnected
      ? "Your wallet is on a network Ingot is not deployed to. Switch to Monad testnet."
      : "Connect a wallet on Monad testnet to trade."
    : "This build of Ingot has no contract addresses for Monad testnet yet. Nothing is wrong with your wallet or network — the deployment step has not run.";

  return (
    <div className="relative mx-auto max-w-2xl overflow-hidden border border-hairline bg-coal px-8 py-16 text-center">
      <Hallmarks />
      <div className="pointer-events-none absolute left-1/2 top-6 h-56 w-80 -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(232,182,97,0.22),transparent_70%)] blur-xl" />
      <div className="relative">
        <motion.div
          className="mx-auto flex h-24 w-24 items-center justify-center"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <IngotMark size={92} />
        </motion.div>
        <div className="label mt-4 text-gold/80">{deployedSomewhere ? "Network" : "Contracts not deployed yet"}</div>
        <h2 className="mt-3 font-display text-[42px] font-light leading-tight text-ink">{title}</h2>
        <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed text-ink-secondary">{body}</p>
        <Link
          href="/"
          className="mt-9 inline-flex border border-hairline px-6 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-secondary transition-colors hover:border-gold/50 hover:text-ink"
        >
          ← Back to the overview
        </Link>
      </div>
    </div>
  );
}
