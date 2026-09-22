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

import { RecoveryPanel } from "@/components/RecoveryPanel";
import { Button, Card, Disclosure, Empty, Field, Row, Segmented, Stat, TextInput } from "@/components/ui";
import { hedgedCreditAbi, ingotMarketAbi, mockUSDCAbi } from "@/lib/abis";
import {
  DEFAULT_SLIPPAGE_BPS,
  SLIPPAGE_OPTIONS,
  formatTolerance,
  minFill,
} from "@/lib/slippage";
import { useDeployment, useFrontSeries } from "@/lib/useIngot";
import { formatHours, formatPrice, formatUsdc, parseDecimal } from "@/lib/format";

type Loan = {
  borrower: `0x${string}`;
  seriesId: bigint;
  offtakeHours: bigint;
  basisRatioBps: number;
  hedgeSize: bigint;
  hedgeEntryPrice: bigint;
  principal: bigint;
  interest: bigint;
  margin: bigint;
  openedAt: bigint;
  maturity: bigint;
  closed: boolean;
};

export default function CreditDesk() {
  const { address } = useAccount();
  const { deployment } = useDeployment();
  const { seriesId, mark } = useFrontSeries();

  const { data: loanIds } = useReadContract({
    address: deployment?.hedgedCredit,
    abi: hedgedCreditAbi,
    functionName: "loansOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(deployment && address) },
  });

  const ids = (loanIds ?? []) as readonly bigint[];

  const { data: loanData } = useReadContracts({
    contracts: deployment
      ? ids.map((id) => ({
          address: deployment.hedgedCredit,
          abi: hedgedCreditAbi,
          functionName: "loanAt" as const,
          args: [id] as const,
        }))
      : [],
    query: { enabled: Boolean(deployment) && ids.length > 0 },
  });

  const loans = (loanData ?? [])
    .map((entry, i) => ({ id: ids[i], loan: entry.result as Loan | undefined }))
    .filter((entry): entry is { id: bigint; loan: Loan } => Boolean(entry.loan));

  const open = loans.filter((entry) => !entry.loan.closed);

  // With no wallet connected, fall back to the protocol's most recent loan so the
  // recovery profile — the thing this page exists to show — renders on arrival rather
  // than behind a connect prompt. It is labelled as someone else's loan when it is.
  const { data: loanCount } = useReadContract({
    address: deployment?.hedgedCredit,
    abi: hedgedCreditAbi,
    functionName: "loanCount",
    query: { enabled: Boolean(deployment) && open.length === 0 },
  });

  const latestId = loanCount && loanCount > 0n ? loanCount - 1n : undefined;

  const { data: latestLoan } = useReadContract({
    address: deployment?.hedgedCredit,
    abi: hedgedCreditAbi,
    functionName: "loanAt",
    args: latestId === undefined ? undefined : [latestId],
    query: { enabled: Boolean(deployment) && latestId !== undefined && open.length === 0 },
  });

  const fallback =
    latestId !== undefined && latestLoan
      ? { id: latestId, loan: latestLoan as Loan }
      : undefined;

  const active = open.at(-1) ?? fallback;
  const showingOwn = open.length > 0;

  if (!deployment) {
    return (
      <Card title="Not deployed here">
        <Empty>Ingot is not deployed on this network. Switch to Monad Testnet.</Empty>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PoolHeader />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <OriginationForm seriesId={seriesId} mark={mark} />

        <Card
          title="Recovery profile"
          subtitle={
            active
              ? showingOwn
                ? "Every point on this chart is returned by HedgedCredit.project() on chain"
                : "Most recent loan on the protocol — every point returned by project() on chain"
              : undefined
          }
        >
          {active ? (
            <RecoveryPanel
              loanId={active.id}
              hedgeEntryPrice={active.loan.hedgeEntryPrice}
              debt={active.loan.principal + active.loan.interest}
              currentPrice={mark}
            />
          ) : (
            <Empty>Draw against an offtake to see how it settles.</Empty>
          )}
        </Card>
      </div>

      {open.length > 0 && (
        <Card title="Your loans">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-ink-muted">
                <tr className="border-b border-hairline">
                  <th className="pb-2 font-normal">Offtake</th>
                  <th className="pb-2 font-normal">Basis</th>
                  <th className="pb-2 font-normal">Hedge</th>
                  <th className="pb-2 font-normal">Struck at</th>
                  <th className="pb-2 font-normal">Principal</th>
                  <th className="pb-2 font-normal">Debt</th>
                  <th className="pb-2 font-normal">Margin</th>
                  <th className="pb-2 font-normal">Matures</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {open.map(({ id, loan }) => (
                  <tr key={id.toString()} className="border-b border-hairline/60 last:border-0">
                    <td className="py-2">{formatHours(loan.offtakeHours)} hrs</td>
                    <td className="py-2">{(loan.basisRatioBps / 100).toFixed(0)}%</td>
                    <td className="py-2">{formatHours(loan.hedgeSize)} hrs</td>
                    <td className="py-2">{formatPrice(loan.hedgeEntryPrice)}</td>
                    <td className="py-2">{formatUsdc(loan.principal)}</td>
                    <td className="py-2">{formatUsdc(loan.principal + loan.interest)}</td>
                    <td className="py-2">{formatUsdc(loan.margin)}</td>
                    <td className="py-2 text-ink-muted">
                      {new Date(Number(loan.maturity) * 1000).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function PoolHeader() {
  const { deployment } = useDeployment();

  const { data } = useReadContracts({
    contracts: deployment
      ? [
          { address: deployment.hedgedCredit, abi: hedgedCreditAbi, functionName: "totalAssets" },
          { address: deployment.hedgedCredit, abi: hedgedCreditAbi, functionName: "availableLiquidity" },
          { address: deployment.hedgedCredit, abi: hedgedCreditAbi, functionName: "ltvBps" },
          { address: deployment.hedgedCredit, abi: hedgedCreditAbi, functionName: "rateBps" },
        ]
      : [],
    query: { enabled: Boolean(deployment) },
  });

  const assets = data?.[0]?.result as bigint | undefined;
  const available = data?.[1]?.result as bigint | undefined;
  const ltv = data?.[2]?.result as number | undefined;
  const rate = data?.[3]?.result as number | undefined;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Pool size" value={assets === undefined ? "—" : formatUsdc(assets)} detail="lender capital" />
      <Stat label="Available" value={available === undefined ? "—" : formatUsdc(available)} detail="undrawn" />
      <Stat label="Advance rate" value={ltv === undefined ? "—" : `${ltv / 100}%`} detail="of hedged revenue" />
      <Stat label="Term rate" value={rate === undefined ? "—" : `${rate / 100}%`} detail="flat, to maturity" />
    </div>
  );
}

function OriginationForm({ seriesId, mark }: { seriesId: bigint | undefined; mark: bigint | undefined }) {
  const { address } = useAccount();
  const { deployment } = useDeployment();
  const [hours, setHours] = useState("");
  const [margin, setMargin] = useState("");
  const [basis, setBasis] = useState("100");
  const [toleranceBps, setToleranceBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);

  const parsedHours = parseDecimal(hours, 18);
  const parsedMargin = parseDecimal(margin, 6);

  // Basis is entered as a percentage of the index and stored in bps.
  const parsedBasisPct = parseDecimal(basis, 2);
  const basisBps = parsedBasisPct === null ? null : Number(parsedBasisPct);
  const basisValid = basisBps !== null && basisBps > 0 && basisBps <= 40_000;

  // The hedge — and the advance — track exposure, not the headline hour count.
  const hedgeSize =
    parsedHours !== null && basisBps !== null
      ? (parsedHours * BigInt(basisBps)) / 10_000n
      : null;

  const { data: terms } = useReadContracts({
    contracts: deployment
      ? [
          { address: deployment.hedgedCredit, abi: hedgedCreditAbi, functionName: "ltvBps" },
          { address: deployment.hedgedCredit, abi: hedgedCreditAbi, functionName: "minMarginBps" },
        ]
      : [],
    query: { enabled: Boolean(deployment) },
  });

  const ltvBps = terms?.[0]?.result as number | undefined;
  const minMarginBps = terms?.[1]?.result as number | undefined;

  const revenue = hedgeSize !== null && mark ? (hedgeSize * mark) / 10n ** 30n : undefined;
  const principal =
    revenue !== undefined && ltvBps !== undefined ? (revenue * BigInt(ltvBps)) / 10_000n : undefined;
  const marginRequired =
    principal !== undefined && minMarginBps !== undefined
      ? (principal * BigInt(minMarginBps)) / 10_000n
      : undefined;

  // The hedge is a short of `hedgeSize`; quote it so the on-chain bound is derived from the
  // price the borrower is actually shown rather than left wide open.
  const { data: hedgeQuote } = useReadContract({
    address: deployment?.market,
    abi: ingotMarketAbi,
    functionName: "quote",
    args:
      seriesId !== undefined && hedgeSize !== null && hedgeSize > 0n
        ? [seriesId, -hedgeSize]
        : undefined,
    query: {
      enabled: Boolean(deployment) && seriesId !== undefined && hedgeSize !== null && hedgeSize > 0n,
    },
  });

  const minHedgePrice = hedgeQuote === undefined ? undefined : minFill(hedgeQuote, toleranceBps);

  const { data: allowance } = useReadContract({
    address: deployment?.usdc,
    abi: mockUSDCAbi,
    functionName: "allowance",
    args: address && deployment ? [address, deployment.hedgedCredit] : undefined,
    query: { enabled: Boolean(deployment && address) },
  });

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const needsApproval = parsedMargin !== null && (allowance ?? 0n) < parsedMargin;
  const marginShort = marginRequired !== undefined && parsedMargin !== null && parsedMargin < marginRequired;
  const busy = isPending || confirming;

  return (
    <Card title="Draw against an offtake" subtitle="The hedge opens in the same transaction">
      <Field label="Offtake" hint="GPU-hours for the delivery window">
        <TextInput
          value={hours}
          onChange={setHours}
          placeholder="100000"
          suffix="hrs"
          invalid={hours !== "" && parsedHours === null}
        />
      </Field>

      <div className="mt-3">
        <Field label="Your realized rate" hint="% of the index">
          <TextInput
            value={basis}
            onChange={setBasis}
            placeholder="100"
            suffix="% of index"
            invalid={basis !== "" && !basisValid}
          />
        </Field>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
          What you actually sell at, relative to the index. Across 23 providers over 78 days,
          levels ran from 45% below the index to 237% above it — so the hedge is sized to your
          exposure, not your hour count.
        </p>
      </div>

      <div className="mt-3">
        <Field label="Your margin" hint="USDC">
          <TextInput
            value={margin}
            onChange={setMargin}
            placeholder="0.00"
            suffix="USDC"
            invalid={(margin !== "" && parsedMargin === null) || marginShort}
          />
        </Field>
      </div>

      <div className="mt-3 border-t border-hairline pt-2">
        <Row label="Forward rate" value={mark === undefined ? "—" : formatPrice(mark)} />
        <Row
          label="Hedge size"
          value={hedgeSize === null ? "—" : `${formatHours(hedgeSize)} hrs`}
          hint="index hours"
          tone="muted"
        />
        <Row label="Hedged revenue" value={revenue === undefined ? "—" : formatUsdc(revenue)} />
        <Row label="You receive" value={principal === undefined ? "—" : formatUsdc(principal)} />
        <Row
          label="Margin required"
          value={marginRequired === undefined ? "—" : formatUsdc(marginRequired)}
          tone={marginShort ? "critical" : "muted"}
        />
        <Row
          label="Min hedge fill"
          value={minHedgePrice === undefined ? "—" : formatPrice(minHedgePrice)}
          hint="enforced on chain"
          tone="muted"
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[12px] text-ink-secondary">Slippage tolerance</span>
        <Segmented
          options={SLIPPAGE_OPTIONS}
          value={toleranceBps}
          onChange={setToleranceBps}
          render={formatTolerance}
        />
      </div>

      <div className="mt-3">
        {needsApproval ? (
          <Button
            disabled={!deployment || busy}
            onClick={() =>
              deployment &&
              writeContract({
                address: deployment.usdc,
                abi: mockUSDCAbi,
                functionName: "approve",
                args: [deployment.hedgedCredit, maxUint256],
              })
            }
          >
            {busy ? "…" : "Approve USDC"}
          </Button>
        ) : (
          <Button
            disabled={
              !deployment ||
              seriesId === undefined ||
              parsedHours === null ||
              parsedHours === 0n ||
              !basisValid ||
              parsedMargin === null ||
              marginShort ||
              minHedgePrice === undefined ||
              busy
            }
            onClick={() =>
              deployment &&
              seriesId !== undefined &&
              parsedHours !== null &&
              basisBps !== null &&
              parsedMargin !== null &&
              minHedgePrice !== undefined &&
              writeContract({
                address: deployment.hedgedCredit,
                abi: hedgedCreditAbi,
                functionName: "open",
                args: [seriesId, parsedHours, basisBps, parsedMargin, minHedgePrice],
              })
            }
          >
            {busy ? "Opening…" : "Draw, hedged"}
          </Button>
        )}
      </div>

      {isSuccess && <p className="mt-2 text-[12px] text-good">Drawn, and hedged in the same block.</p>}
      {error && <p className="mt-2 break-words text-[12px] text-critical">{error.message.split("\n")[0]}</p>}

      <Disclosure>
        The hedge will not fill below the bound above. It fixes the rate you sell compute at; it
        does not guarantee you sell it. If your
        offtake does not materialise you still owe the debt, and the short can lose money your
        revenue was supposed to cover. Rate risk is hedged here — delivery risk and the promise to
        repay are not.
      </Disclosure>
    </Card>
  );
}
