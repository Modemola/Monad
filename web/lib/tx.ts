"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, useSyncExternalStore } from "react";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";
import { useChainId, useConfig, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

import { anvil, monadTestnet } from "./chains";

// ---------------------------------------------------------------------------
// Toasts: a tiny external store, so any component can raise one and one host renders them all.
// ---------------------------------------------------------------------------

export type ToastStatus = "signing" | "pending" | "success" | "error";

export type Toast = {
  id: number;
  title: string;
  status: ToastStatus;
  detail?: string;
  hash?: `0x${string}`;
  explorer?: string;
};

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    subscribe,
    () => toasts,
    () => toasts,
  );
}

export function pushToast(toast: Omit<Toast, "id">): number {
  const id = nextId++;
  toasts = [...toasts, { ...toast, id }].slice(-4);
  emit();
  return id;
}

export function updateToast(id: number, patch: Partial<Toast>) {
  toasts = toasts.map((toast) => (toast.id === id ? { ...toast, ...patch } : toast));
  emit();
}

export function dismissToast(id: number) {
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

// ---------------------------------------------------------------------------
// Errors: what the contract actually refused, in words a trader can act on.
// ---------------------------------------------------------------------------

const REVERTS: Record<string, string> = {
  InsufficientMargin: "Not enough free margin for this size. Deposit more collateral or trade smaller.",
  PriceLimitExceeded: "The price moved past your slippage tolerance. Try again, or widen the tolerance.",
  VaultAtCapacity: "The underwriter vault is at capacity on this side. Try a smaller size or the other side.",
  WithdrawExceedsBalance: "Only realized cash can be withdrawn. Unrealized profit backs your margin until you close.",
  SeriesExpired: "This contract has expired. It can be settled, not traded.",
  SeriesAlreadySettled: "This contract has already settled.",
  ZeroSize: "Enter a size first.",
  ZeroAmount: "Enter an amount first.",
  NotLiquidatable: "That account is healthy and cannot be liquidated.",
  MarginTooSmall: "Your margin is below the required share of the principal.",
  InsufficientLiquidity: "The pool does not have that much undrawn liquidity right now.",
  PrincipalTooSmall: "That loan is below the minimum size. Increase the offtake.",
  BorrowerNotApproved: "Borrowing is limited to approved borrowers on this deployment.",
  NotBorrower: "Only the borrower can close this loan.",
  LoanAlreadyClosed: "This loan is already closed.",
  SeriesNotSettled: "The contract has not settled yet, so the loan cannot close.",
  VaultInsolvent: "The pool has no assets to price shares against.",
  FirstDepositTooSmall: "The first deposit must be a little larger.",
  ERC20InsufficientBalance: "Your wallet does not hold enough USDC.",
  ERC20InsufficientAllowance: "Approve USDC first.",
  InvalidParameter: "One of the inputs is outside what the contract allows.",
};

export function explainError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "You declined the request in your wallet.";
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = revert?.data?.errorName;
    if (name && REVERTS[name]) return REVERTS[name];
    if (name) return `The contract refused the transaction (${name}).`;
    if (revert?.reason) return revert.reason;
    return error.shortMessage;
  }
  if (error instanceof Error) {
    if (/user (rejected|denied)/i.test(error.message)) return "You declined the request in your wallet.";
    return error.message.split("\n")[0];
  }
  return "Something went wrong.";
}

export function explorerTx(chainId: number, hash: `0x${string}`): string | undefined {
  if (chainId === monadTestnet.id) return `${monadTestnet.blockExplorers.default.url}/tx/${hash}`;
  if (chainId === anvil.id) return undefined;
  return undefined;
}

// ---------------------------------------------------------------------------
// The hook every write goes through.
// ---------------------------------------------------------------------------

type WriteRequest = Parameters<ReturnType<typeof useWriteContract>["writeContractAsync"]>[0];

export type TxState = {
  status: "idle" | ToastStatus;
  hash?: `0x${string}`;
  error?: string;
};

/// Sign, submit, confirm — with a toast that follows the transaction through each step, an explorer
/// link once it has a hash, a plain-language reason if it fails, and every read refreshed the moment
/// it lands rather than on the next poll.
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const config = useConfig();
  const chainId = useChainId();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxState>({ status: "idle" });

  const send = useCallback(
    async (request: WriteRequest, copy: { label: string; success?: string }) => {
      const id = pushToast({ title: copy.label, status: "signing", detail: "Confirm in your wallet" });
      setState({ status: "signing" });
      try {
        const hash = await writeContractAsync(request);
        const explorer = explorerTx(chainId, hash);
        updateToast(id, { status: "pending", hash, explorer, detail: "Waiting for the block" });
        setState({ status: "pending", hash });

        const receipt = await waitForTransactionReceipt(config, { hash });
        if (receipt.status !== "success") throw new Error("The transaction reverted on chain.");

        updateToast(id, { status: "success", detail: copy.success ?? "Confirmed" });
        setState({ status: "success", hash });
        await queryClient.invalidateQueries();
        setTimeout(() => dismissToast(id), 6_000);
        return receipt;
      } catch (error) {
        const message = explainError(error);
        updateToast(id, { status: "error", detail: message });
        setState({ status: "error", error: message });
        setTimeout(() => dismissToast(id), 12_000);
        return undefined;
      }
    },
    [writeContractAsync, config, chainId, queryClient],
  );

  return {
    send,
    ...state,
    busy: state.status === "signing" || state.status === "pending",
    reset: () => setState({ status: "idle" }),
  };
}
