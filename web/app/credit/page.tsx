"use client";

import { useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { maxUint256 } from "viem";

import { LoanBook } from "@/components/Activity";
import { Reveal } from "@/components/fx/motion";
import { NotDeployed } from "@/components/NotDeployed";
import { AppFrame, PageHeader } from "@/components/PageHeader";
import { RecoveryPanel } from "@/components/RecoveryPanel";
import { Button, Card, Disclosure, Empty, Field, Row, Segmented, Stat, StatStrip, TextInput } from "@/components/ui";
import { hedgedCreditAbi, ingotIndexAbi, ingotMarketAbi, mockUSDCAbi } from "@/lib/abis";
import {
  DEFAULT_SLIPPAGE_BPS,
  SLIPPAGE_OPTIONS,
  formatTolerance,
  minFill,
} from "@/lib/slippage";
import { useDeployment, useFrontSeries, type Series } from "@/lib/useIngot";
import { formatHours, formatPrice, formatUsdc, parseDecimal, toInputAmount } from "@/lib/format";
import { useTx } from "@/lib/tx";

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
  const { seriesId, mark, expired } = useFrontSeries();

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
      <AppFrame>
        <NotDeployed />
      </AppFrame>
    );
  }

  return (
    <AppFrame>
      <PageHeader
        eyebrow="Credit desk · HedgedCredit"
        title="Credit that hedges itself."
        accent="hedges"
        subtitle="Draw against GPU offtake revenue. The short opens in the same transaction, sized to your basis, so the lender is repaid at any rate."
      />
    <div className="space-y-4">
      <Reveal>
        <PoolHeader />
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <OriginationForm seriesId={seriesId} mark={mark} expired={expired} />

        <Card
          eyebrow="HedgedCredit.project()"
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
        <Card eyebrow="Portfolio" title="Your loans">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                <tr className="border-b border-hairline">
                  <th className="pb-2 font-normal">Offtake</th>
                  <th className="pb-2 font-normal">Basis</th>
                  <th className="pb-2 font-normal">Hedge</th>
                  <th className="pb-2 font-normal">Struck at</th>
                  <th className="pb-2 font-normal">Principal</th>
                  <th className="pb-2 font-normal">Debt</th>
                  <th className="pb-2 font-normal">Margin</th>
                  <th className="pb-2 font-normal">Matures</th>
                  <th className="pb-2 text-right font-normal">Status</th>
                </tr>
              </thead>
              <tbody className="tnum font-mono text-[12px]">
                {open.map(({ id, loan }) => (
                  <tr key={id.toString()} className="border-b border-hairline last:border-0">
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
                    <td className="py-2 text-right">
                      <CloseLoan id={id} seriesId={loan.seriesId} maturity={loan.maturity} margin={loan.margin} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <LoanBook />
    </div>
    </AppFrame>
  );
}

/// A matured loan closes against the settled contract: the hedge's PnL is netted against the debt
/// and the margin is applied first. Before maturity there is nothing to press. If the contract has
/// not been settled yet, settling it is one permissionless call away, so the borrower can do it
/// rather than wait for the keeper. Whatever the margin does not cover is pulled from the
/// borrower's wallet, so that amount is shown, and approved, before the close.
function CloseLoan({ id, seriesId, maturity, margin }: { id: bigint; seriesId: bigint; maturity: bigint; margin: bigint }) {
  const { address } = useAccount();
  const { deployment, chainId } = useDeployment();
  const tx = useTx();
  const matured = Date.now() / 1000 >= Number(maturity);

  const { data } = useReadContracts({
    contracts:
      deployment && address
        ? [
            { chainId, address: deployment.market, abi: ingotMarketAbi, functionName: "seriesAt", args: [seriesId] },
            { chainId, address: deployment.index, abi: ingotIndexAbi, functionName: "finalizedThrough" },
            { chainId, address: deployment.hedgedCredit, abi: hedgedCreditAbi, functionName: "debtOf", args: [id] },
            { chainId, address: deployment.hedgedCredit, abi: hedgedCreditAbi, functionName: "hedgePnlOf", args: [id] },
            {
              chainId,
              address: deployment.usdc,
              abi: mockUSDCAbi,
              functionName: "allowance",
              args: [address, deployment.hedgedCredit],
            },
            { chainId, address: deployment.usdc, abi: mockUSDCAbi, functionName: "balanceOf", args: [address] },
          ]
        : [],
    query: { enabled: Boolean(deployment && address) && matured },
  });
  const series = data?.[0]?.result as Series | undefined;
  const finalizedThrough = data?.[1]?.result as bigint | undefined;
  const debt = data?.[2]?.result as bigint | undefined;
  const hedgePnl = data?.[3]?.result as bigint | undefined;
  const allowance = data?.[4]?.result as bigint | undefined;
  const wallet = data?.[5]?.result as bigint | undefined;

  if (!matured) return <span className="text-ink-muted">Open</span>;
  if (!series || debt === undefined || hedgePnl === undefined) return <span className="text-ink-muted">…</span>;

  const settleFirst = !series.settled;
  if (settleFirst && (finalizedThrough === undefined || finalizedThrough < series.expiry)) {
    return <span className="text-ink-muted" title="Settles once the index is final through expiry">Awaiting print</span>;
  }

  // What the wallet pays on close: the debt, less the hedge's gain (or plus its loss), less margin.
  const due = settleFirst ? 0n : debt - hedgePnl - margin;
  const short = due > 0n && wallet !== undefined && wallet < due;
  const needsApproval = due > 0n && (allowance ?? 0n) < due;

  const style =
    "border border-gold/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-gold transition-colors hover:border-gold disabled:opacity-40";
  const label = settleFirst ? "Settle" : needsApproval ? "Approve" : "Close";

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={!deployment || tx.busy || short}
        onClick={() => {
          if (!deployment) return;
          if (settleFirst) {
            tx.send(
              { address: deployment.market, abi: ingotMarketAbi, functionName: "settleSeries", args: [seriesId] },
              { label: `Settle series #${seriesId.toString()}`, success: "Contract settled — now close the loan" },
            );
          } else if (needsApproval) {
            tx.send(
              { address: deployment.usdc, abi: mockUSDCAbi, functionName: "approve", args: [deployment.hedgedCredit, due] },
              { label: `Approve ${formatUsdc(due)} to repay loan #${id.toString()}`, success: "Approved — now close the loan" },
            );
          } else {
            tx.send(
              { address: deployment.hedgedCredit, abi: hedgedCreditAbi, functionName: "close", args: [id] },
              { label: `Close loan #${id.toString()}`, success: "Loan closed" },
            );
          }
        }}
        className={style}
      >
        {tx.busy ? "…" : label}
      </button>
      {!settleFirst && (
        <span className={`text-[10.5px] ${short ? "text-critical" : "text-ink-muted"}`}>
          {due > 0n ? `${formatUsdc(due)} due${short ? " · wallet short" : ""}` : `${formatUsdc(-due)} back to you`}
        </span>
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
    <StatStrip className="grid-cols-2 lg:grid-cols-4">
      <Stat label="Pool size" value={assets === undefined ? "—" : formatUsdc(assets)} detail="lender capital" accent="gold" />
      <Stat label="Available" value={available === undefined ? "—" : formatUsdc(available)} detail="undrawn" accent="cobalt" />
      <Stat label="Advance rate" value={ltv === undefined ? "—" : `${ltv / 100}%`} detail="of hedged revenue" accent="violet" />
      <Stat label="Term rate" value={rate === undefined ? "—" : `${rate / 100}%`} detail="flat, to maturity" accent="good" />
    </StatStrip>
  );
}

function OriginationForm({
  seriesId,
  mark,
  expired,
}: {
  seriesId: bigint | undefined;
  mark: bigint | undefined;
  /// The front contract has stopped trading, so there is nothing to hedge into until next month lists.
  expired: boolean;
}) {
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
          { address: deployment.hedgedCredit, abi: hedgedCreditAbi, functionName: "maxBasisRatioBps" },
          { address: deployment.hedgedCredit, abi: hedgedCreditAbi, functionName: "minPrincipal" },
        ]
      : [],
    query: { enabled: Boolean(deployment) },
  });

  const ltvBps = terms?.[0]?.result as number | undefined;
  const minMarginBps = terms?.[1]?.result as number | undefined;
  // The contract's own limits, so the form refuses what the chain would refuse before anyone signs.
  const maxBasisBps = (terms?.[2]?.result as number | undefined) ?? 25_000;
  const minPrincipal = terms?.[3]?.result as bigint | undefined;
  const basisValid = basisBps !== null && basisBps > 0 && basisBps <= maxBasisBps;

  const revenue = hedgeSize !== null && mark ? (hedgeSize * mark) / 10n ** 30n : undefined;
  const principal =
    revenue !== undefined && ltvBps !== undefined ? (revenue * BigInt(ltvBps)) / 10_000n : undefined;
  const marginRequired =
    principal !== undefined && minMarginBps !== undefined
      ? (principal * BigInt(minMarginBps)) / 10_000n
      : undefined;
  const principalTooSmall = principal !== undefined && minPrincipal !== undefined && principal < minPrincipal;

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

  const tx = useTx();

  const needsApproval = parsedMargin !== null && (allowance ?? 0n) < parsedMargin;
  const marginShort = marginRequired !== undefined && parsedMargin !== null && parsedMargin < marginRequired;
  const busy = tx.busy;

  return (
    <Card
      eyebrow="Origination"
      title="Draw against an offtake"
      subtitle="The hedge opens in the same transaction"
      action={
        <button
          type="button"
          onClick={() => {
            setHours("100000");
            setBasis("100");
            setMargin("");
          }}
          className="border border-gold/30 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-gold/80 transition-colors hover:border-gold/70 hover:text-gold"
        >
          Example
        </button>
      }
    >
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
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
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
            shortcuts={[
              {
                label: "Minimum",
                // Rounded up a cent, so a truncated display never lands just under the requirement.
                value: marginRequired === undefined ? undefined : toInputAmount(marginRequired + 10_000n),
              },
            ]}
          />
        </Field>
      </div>

      <div className="mt-4 border-t border-hairline pt-1">
        <Row label="Forward rate" value={mark === undefined ? "—" : formatPrice(mark)} />
        <Row
          label="Hedge size"
          value={hedgeSize === null ? "—" : `${formatHours(hedgeSize)} hrs`}
          hint="index hours"
          tone="muted"
        />
        <Row label="Hedged revenue" value={revenue === undefined ? "—" : formatUsdc(revenue)} />
        <Row
          label="You receive"
          value={principal === undefined ? "—" : formatUsdc(principal)}
          tone={principalTooSmall ? "critical" : "default"}
        />
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
              tx.send(
                { address: deployment.usdc, abi: mockUSDCAbi, functionName: "approve", args: [deployment.hedgedCredit, maxUint256] },
                { label: "Approve USDC for the credit pool", success: "Approved — now draw" },
              )
            }
          >
            {busy ? "…" : "Approve USDC"}
          </Button>
        ) : (
          <Button
            variant="gold"
            disabled={
              !deployment ||
              seriesId === undefined ||
              parsedHours === null ||
              parsedHours === 0n ||
              !basisValid ||
              parsedMargin === null ||
              marginShort ||
              principalTooSmall ||
              minHedgePrice === undefined ||
              expired ||
              busy
            }
            onClick={() =>
              deployment &&
              seriesId !== undefined &&
              parsedHours !== null &&
              basisBps !== null &&
              parsedMargin !== null &&
              minHedgePrice !== undefined &&
              tx.send(
                {
                  address: deployment.hedgedCredit,
                  abi: hedgedCreditAbi,
                  functionName: "open",
                  args: [seriesId, parsedHours, basisBps, parsedMargin, minHedgePrice],
                },
                {
                  label: `Draw ${principal === undefined ? "" : formatUsdc(principal)} against ${formatHours(parsedHours)} GPU-hrs`,
                  success: "Drawn, and hedged in the same block",
                },
              )
            }
          >
            {tx.status === "signing" ? "Confirm in wallet…" : tx.status === "pending" ? "Opening…" : "Draw, hedged →"}
          </Button>
        )}
      </div>

      {expired && (
        <p className="mt-2 text-[12px] text-ink-secondary">
          The front contract has expired, so there is no hedge to open. The keeper lists next month on its
          next run.
        </p>
      )}
      {principalTooSmall && minPrincipal !== undefined && (
        <p className="mt-2 text-[12px] text-critical">
          The smallest loan is {formatUsdc(minPrincipal)}. Increase the offtake or your realized rate.
        </p>
      )}
      {basis !== "" && !basisValid && (
        <p className="mt-2 text-[12px] text-critical">
          Realized rate must be above 0% and at most {(maxBasisBps / 100).toFixed(0)}% of the index.
        </p>
      )}
      {tx.status === "success" && <p className="mt-2 text-[12px] text-good">Drawn, and hedged in the same block.</p>}
      {tx.status === "error" && <p className="mt-2 break-words text-[12px] text-critical">{tx.error}</p>}

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
