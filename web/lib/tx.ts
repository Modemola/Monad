"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  TransactionNotFoundError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { useChainId, useConfig, useWriteContract } from "wagmi";
import { getTransaction, waitForTransactionReceipt } from "wagmi/actions";

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
  IndexMoving:
    "A new index print is waiting out its finality delay and moves the price sharply. Opening is paused until it lands (within the hour); closing still works.",
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

class NeverSeenError extends Error {}

/// Rejects if the chain this app reads has still not heard of the transaction after half a minute.
///
/// A wallet sends through its own RPC. When that RPC is a different node — a stale copy of the
/// testnet, or another network on the same chain id — the wallet reports success, the hash it
/// returns exists nowhere the app can see, and the receipt wait would sit at "pending" until it
/// timed out. Monad includes a transaction within a second or two, so thirty seconds of silence is
/// conclusive. Never settles once the transaction has been seen.
function neverSeen(config: Parameters<typeof getTransaction>[0], hash: `0x${string}`, chainId: number): Promise<never> {
  return new Promise((_, reject) => {
    const started = Date.now();
    const poll = async () => {
      try {
        await getTransaction(config, { hash, chainId });
        return; // seen: leave the receipt wait to finish the job
      } catch (error) {
        // Only an explicit "no such transaction" counts; a flaky RPC is not evidence of anything.
        const missing = error instanceof TransactionNotFoundError;
        if (missing && Date.now() - started > 30_000) return reject(new NeverSeenError());
        setTimeout(poll, 2_000);
      }
    };
    setTimeout(poll, 2_000);
  });
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

        // Monad blocks every 400 ms, so a healthy transaction lands in a second or two. Poll once a
        // second, ride out a rate-limited or flaky RPC, and give up waiting after two minutes with
        // something the visitor can act on, instead of "pending" forever.
        const receipt = await Promise.race([
          waitForTransactionReceipt(config, {
            hash,
            chainId,
            pollingInterval: 1_000,
            retryCount: 20,
            timeout: 120_000,
          }),
          neverSeen(config, hash, chainId),
        ]);
        if (receipt.status !== "success") throw new Error("The transaction reverted on chain.");

        updateToast(id, { status: "success", detail: copy.success ?? "Confirmed" });
        setState({ status: "success", hash });
        await queryClient.invalidateQueries();
        setTimeout(() => dismissToast(id), 6_000);
        return receipt;
      } catch (error) {
        const message =
          error instanceof NeverSeenError
            ? "Your wallet sent this, but Monad testnet never received it: the wallet's Monad Testnet network is using a different RPC. Set it to https://testnet-rpc.monad.xyz (chain ID 10143) in the wallet's network settings, then try again."
            : error instanceof WaitForTransactionReceiptTimeoutError
            ? "Not confirmed after two minutes. Check your wallet's activity: if it is still pending, speed it up or cancel it and try again; if it was dropped, simply retry. Make sure the wallet is on Monad Testnet."
            : explainError(error);
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
