"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { maxUint256 } from "viem";

import { ingotMarketAbi, mockUSDCAbi } from "@/lib/abis";
import { useDeployment } from "@/lib/useIngot";
import { USDC, formatUsdc, parseDecimal } from "@/lib/format";
import { Button, Field, Row, TextInput } from "./ui";

/// Deposit and withdraw margin. Kept separate from the ticket so the two irreversible
/// actions — moving money in, and taking risk — are never one click.
export function Collateral({
  balance,
  freeCollateral,
}: {
  balance: bigint | undefined;
  freeCollateral: bigint | undefined;
}) {
  const { address } = useAccount();
  const { deployment } = useDeployment();
  const [amount, setAmount] = useState("");

  const parsed = parseDecimal(amount, 6);
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });
  // Clear the amount once a deposit or withdrawal lands, not after an approval: the deposit that
  // follows an approval still needs it.
  const [clearAfter, setClearAfter] = useState<`0x${string}`>();
  useEffect(() => {
    if (confirmed && hash !== undefined && hash === clearAfter) setAmount("");
  }, [confirmed, hash, clearAfter]);

  const { data: walletBalance } = useReadContract({
    address: deployment?.usdc,
    abi: mockUSDCAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(deployment && address) },
  });

  const { data: allowance } = useReadContract({
    address: deployment?.usdc,
    abi: mockUSDCAbi,
    functionName: "allowance",
    args: address && deployment ? [address, deployment.market] : undefined,
    query: { enabled: Boolean(deployment && address) },
  });

  const needsApproval = parsed !== null && (allowance ?? 0n) < parsed;
  const busy = isPending || confirming;

  return (
    <div>
      <Row label="Wallet USDC" value={walletBalance === undefined ? "—" : formatUsdc(walletBalance)} />
      <Row label="Posted as margin" value={balance === undefined ? "—" : formatUsdc(balance)} />
      <Row
        label="Free collateral"
        value={freeCollateral === undefined ? "—" : formatUsdc(freeCollateral)}
        hint="withdrawable"
        tone="muted"
      />

      <div className="mt-4 space-y-2.5">
        <Field label="Amount" hint="USDC">
          <TextInput
            value={amount}
            onChange={setAmount}
            placeholder="0.00"
            suffix="USDC"
            invalid={amount !== "" && parsed === null}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          {needsApproval ? (
            <Button
              disabled={!deployment || busy}
              onClick={() =>
                deployment &&
                writeContract({
                  address: deployment.usdc,
                  abi: mockUSDCAbi,
                  functionName: "approve",
                  args: [deployment.market, maxUint256],
                })
              }
            >
              {busy ? "…" : "Approve"}
            </Button>
          ) : (
            <Button
              disabled={!deployment || parsed === null || parsed === 0n || busy}
              onClick={() =>
                deployment &&
                parsed !== null &&
                writeContract(
                  {
                    address: deployment.market,
                    abi: ingotMarketAbi,
                    functionName: "deposit",
                    args: [parsed],
                  },
                  { onSuccess: setClearAfter },
                )
              }
            >
              {busy ? "…" : "Deposit"}
            </Button>
          )}

          <Button
            variant="ghost"
            disabled={!deployment || parsed === null || parsed === 0n || busy}
            onClick={() =>
              deployment &&
              parsed !== null &&
              writeContract(
                {
                  address: deployment.market,
                  abi: ingotMarketAbi,
                  functionName: "withdraw",
                  args: [parsed],
                },
                { onSuccess: setClearAfter },
              )
            }
          >
            Withdraw
          </Button>
        </div>

        {deployment && walletBalance !== undefined && walletBalance < 100n * USDC && (
          <Button
            variant="gold"
            disabled={!address || busy}
            onClick={() =>
              address &&
              writeContract({
                address: deployment.usdc,
                abi: mockUSDCAbi,
                functionName: "mint",
                args: [address, 250_000n * USDC],
              })
            }
          >
            Get 250,000 test USDC
          </Button>
        )}
      </div>
    </div>
  );
}
