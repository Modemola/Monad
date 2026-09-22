"use client";

import { useState } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { maxUint256 } from "viem";

import { Button, Card, Disclosure, Field, Row, Stat, TextInput } from "@/components/ui";
import { ingotMarketAbi, mockUSDCAbi, underwriterVaultAbi } from "@/lib/abis";
import { useDeployment, useFrontSeries } from "@/lib/useIngot";
import { formatLots, formatSignedUsdc, formatUsdc, parseDecimal } from "@/lib/format";

export default function Underwrite() {
  const { address } = useAccount();
  const { deployment } = useDeployment();
  const { seriesId } = useFrontSeries();
  const [amount, setAmount] = useState("");

  const parsed = parseDecimal(amount, 6);

  const { data: pool } = useReadContracts({
    contracts: deployment
      ? [
          { address: deployment.underwriterVault, abi: underwriterVaultAbi, functionName: "totalAssets" },
          { address: deployment.underwriterVault, abi: underwriterVaultAbi, functionName: "availableLiquidity" },
          { address: deployment.underwriterVault, abi: underwriterVaultAbi, functionName: "sharePrice" },
          { address: deployment.underwriterVault, abi: underwriterVaultAbi, functionName: "totalSupply" },
        ]
      : [],
    query: { enabled: Boolean(deployment) },
  });

  const { data: shares } = useReadContract({
    address: deployment?.underwriterVault,
    abi: underwriterVaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(deployment && address) },
  });

  const { data: inventory } = useReadContract({
    address: deployment?.market,
    abi: ingotMarketAbi,
    functionName: "positionOf",
    args: deployment && seriesId !== undefined ? [deployment.underwriterVault, seriesId] : undefined,
    query: { enabled: Boolean(deployment) && seriesId !== undefined },
  });

  const { data: allowance } = useReadContract({
    address: deployment?.usdc,
    abi: mockUSDCAbi,
    functionName: "allowance",
    args: address && deployment ? [address, deployment.underwriterVault] : undefined,
    query: { enabled: Boolean(deployment && address) },
  });

  const { data: claim } = useReadContract({
    address: deployment?.underwriterVault,
    abi: underwriterVaultAbi,
    functionName: "previewRedeem",
    args: shares !== undefined ? [shares] : undefined,
    query: { enabled: Boolean(deployment) && shares !== undefined && shares > 0n },
  });

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash });

  const assets = pool?.[0]?.result as bigint | undefined;
  const available = pool?.[1]?.result as bigint | undefined;
  const sharePrice = pool?.[2]?.result as bigint | undefined;
  const supply = pool?.[3]?.result as bigint | undefined;

  const position = inventory as { size: bigint; cost: bigint } | undefined;
  const needsApproval = parsed !== null && (allowance ?? 0n) < parsed;
  const busy = isPending || confirming;

  if (!deployment) {
    return (
      <Card title="Not deployed here">
        <Row label="Network" value="unsupported" tone="critical" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Vault NAV" value={assets === undefined ? "—" : formatUsdc(assets)} detail="mark to market" />
        <Stat
          label="Share price"
          value={sharePrice === undefined ? "—" : formatUsdc(sharePrice, 4)}
          detail="per share"
        />
        <Stat
          label="Free liquidity"
          value={available === undefined ? "—" : formatUsdc(available)}
          detail="redeemable now"
        />
        <Stat
          label="Inventory"
          value={position ? `${formatLots(position.size)} lots` : "—"}
          detail={position && position.size !== 0n ? (position.size > 0n ? "net long" : "net short") : "flat"}
          tone={position && position.size !== 0n ? (position.size > 0n ? "good" : "critical") : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card title="Underwrite" subtitle="Take the other side, earn the spread">
          <Field label="Amount" hint="USDC">
            <TextInput
              value={amount}
              onChange={setAmount}
              placeholder="0.00"
              suffix="USDC"
              invalid={amount !== "" && parsed === null}
            />
          </Field>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {needsApproval ? (
              <Button
                disabled={busy}
                onClick={() =>
                  writeContract({
                    address: deployment.usdc,
                    abi: mockUSDCAbi,
                    functionName: "approve",
                    args: [deployment.underwriterVault, maxUint256],
                  })
                }
              >
                {busy ? "…" : "Approve"}
              </Button>
            ) : (
              <Button
                disabled={parsed === null || parsed === 0n || busy}
                onClick={() =>
                  parsed !== null &&
                  writeContract({
                    address: deployment.underwriterVault,
                    abi: underwriterVaultAbi,
                    functionName: "deposit",
                    args: [parsed],
                  })
                }
              >
                {busy ? "…" : "Deposit"}
              </Button>
            )}

            <Button
              variant="ghost"
              disabled={!shares || shares === 0n || busy}
              onClick={() =>
                shares &&
                writeContract({
                  address: deployment.underwriterVault,
                  abi: underwriterVaultAbi,
                  functionName: "redeem",
                  args: [shares],
                })
              }
            >
              Redeem all
            </Button>
          </div>

          <div className="mt-3 border-t border-hairline pt-2">
            <Row label="Your shares" value={shares === undefined ? "—" : formatUsdc(shares, 2)} />
            <Row label="Your claim" value={claim === undefined ? "—" : formatUsdc(claim)} />
            <Row
              label="Pool share"
              value={
                shares === undefined || supply === undefined || supply === 0n
                  ? "—"
                  : `${(Number((shares * 10_000n) / supply) / 100).toFixed(2)}%`
              }
              tone="muted"
            />
          </div>

          {error && <p className="mt-2 break-words text-[12px] text-critical">{error.message.split("\n")[0]}</p>}

          <Disclosure>
            The vault is the counterparty to every trade on Ingot. It earns the half-spread and
            taker fees, and it carries the inventory that comes with them — when traders are
            right, the vault is wrong, and NAV falls. Redemptions are limited to capital not
            currently backing open positions.
          </Disclosure>
        </Card>

        <Card title="How the vault makes money" subtitle="And how it loses it">
          <div className="space-y-4 text-[13px] leading-relaxed text-ink-secondary">
            <p>
              Every trade on Ingot is filled against this vault. It quotes a two-way price off the
              mark: a fixed half-spread, plus an inventory skew that widens as the vault
              accumulates one-sided risk. A trade that unwinds that risk is always quoted better
              than one that adds to it.
            </p>
            <p>
              Revenue is the spread and the taker fee, collected on every fill regardless of
              direction. Against that sits the inventory: the vault is the natural counterparty to
              hedgers, so it tends to end up long compute when neoclouds are selling it forward.
              That exposure is real and it is marked continuously — the NAV above is not a book
              value.
            </p>
            <p>
              Capacity is not a setting. The vault is an ordinary margin account in the same engine
              as every trader, so when it can no longer meet maintenance margin, quotes simply
              stop.
            </p>
            <div className="border-t border-hairline pt-3">
              <Row
                label="Current inventory"
                value={position ? `${formatLots(position.size)} lots` : "flat"}
                tone={position && position.size !== 0n ? "default" : "muted"}
              />
              <Row
                label="Inventory cost basis"
                value={position && position.size !== 0n ? formatSignedUsdc(position.cost) : "—"}
                tone="muted"
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
