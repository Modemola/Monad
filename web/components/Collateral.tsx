"use client";

import { useState } from "react";
import { maxUint256 } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { ingotMarketAbi, mockUSDCAbi } from "@/lib/abis";
import { USDC, formatUsdc, parseDecimal, toInputAmount } from "@/lib/format";
import { useTx } from "@/lib/tx";
import { useDeployment } from "@/lib/useIngot";
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
  const tx = useTx();

  const parsed = parseDecimal(amount, 6);

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

  // Only realized cash can leave the market, so what is withdrawable is the smaller of free
  // collateral and the cash balance — unrealized profit backs margin but is not paid out.
  const cash = balance === undefined ? undefined : balance > 0n ? balance : 0n;
  const withdrawable =
    freeCollateral === undefined || cash === undefined ? undefined : freeCollateral < cash ? freeCollateral : cash;

  const needsApproval = parsed !== null && (allowance ?? 0n) < parsed;
  const overWallet = parsed !== null && walletBalance !== undefined && parsed > walletBalance;
  const overWithdrawable = parsed !== null && withdrawable !== undefined && parsed > withdrawable;
  const busy = tx.busy;

  async function run(functionName: "deposit" | "withdraw") {
    if (!deployment || parsed === null) return;
    const receipt = await tx.send(
      { address: deployment.market, abi: ingotMarketAbi, functionName, args: [parsed] },
      {
        label: `${functionName === "deposit" ? "Deposit" : "Withdraw"} ${formatUsdc(parsed)}`,
        success: functionName === "deposit" ? "Posted as margin" : "Back in your wallet",
      },
    );
    if (receipt) setAmount("");
  }

  return (
    <div>
      <Row label="Wallet USDC" value={walletBalance === undefined ? "—" : formatUsdc(walletBalance)} />
      <Row label="Posted as margin" value={balance === undefined ? "—" : formatUsdc(balance)} />
      <Row
        label="Withdrawable"
        value={withdrawable === undefined ? "—" : formatUsdc(withdrawable)}
        hint="realized cash above margin"
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
            shortcuts={[
              { label: "Wallet", value: walletBalance === undefined ? undefined : toInputAmount(walletBalance) },
              { label: "Free", value: withdrawable === undefined ? undefined : toInputAmount(withdrawable) },
            ]}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          {needsApproval ? (
            <Button
              disabled={!deployment || busy}
              onClick={() =>
                deployment &&
                tx.send(
                  { address: deployment.usdc, abi: mockUSDCAbi, functionName: "approve", args: [deployment.market, maxUint256] },
                  { label: "Approve USDC for the market", success: "Approved — now deposit" },
                )
              }
            >
              {busy ? "…" : "Approve"}
            </Button>
          ) : (
            <Button disabled={!deployment || parsed === null || parsed === 0n || overWallet || busy} onClick={() => run("deposit")}>
              {busy ? "…" : "Deposit"}
            </Button>
          )}

          <Button
            variant="ghost"
            disabled={!deployment || parsed === null || parsed === 0n || overWithdrawable || busy}
            onClick={() => run("withdraw")}
          >
            Withdraw
          </Button>
        </div>

        {overWallet && !overWithdrawable && (
          <p className="text-[12px] text-ink-muted">More than your wallet holds — you can still withdraw this much.</p>
        )}
        {overWallet && overWithdrawable && <p className="text-[12px] text-critical">More than your wallet holds or can withdraw.</p>}
        {tx.status === "error" && <p className="break-words text-[12px] text-critical">{tx.error}</p>}

        {deployment && walletBalance !== undefined && walletBalance < 100n * USDC && (
          <Button
            variant="gold"
            disabled={!address || busy}
            onClick={() =>
              address &&
              tx.send(
                { address: deployment.usdc, abi: mockUSDCAbi, functionName: "mint", args: [address, 250_000n * USDC] },
                { label: "Mint 250,000 test USDC", success: "Test USDC is in your wallet" },
              )
            }
          >
            Get 250,000 test USDC
          </Button>
        )}
      </div>
    </div>
  );
}
