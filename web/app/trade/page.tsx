"use client";

import { useReadContract } from "wagmi";

import { MarketActivity } from "@/components/Activity";
import { IndexChart } from "@/components/charts";
import { Collateral } from "@/components/Collateral";
import { Reveal } from "@/components/fx/motion";
import { NotDeployed } from "@/components/NotDeployed";
import { AppFrame, PageHeader } from "@/components/PageHeader";
import { Ticket } from "@/components/Ticket";
import { Card, Empty, LiveDot, Row, Stat, StatStrip } from "@/components/ui";
import { ingotMarketAbi } from "@/lib/abis";
import { useAccountState, useDeployment, useFrontSeries, useIndexHistory } from "@/lib/useIngot";
import {
  formatHours,
  formatLots,
  formatPrice,
  formatSignedUsdc,
  formatUsdc,
  healthRatio,
} from "@/lib/format";

export default function Terminal() {
  const { deployment } = useDeployment();
  const { seriesId, series, mark } = useFrontSeries();
  const history = useIndexHistory();
  const account = useAccountState(seriesId);

  const { data: takerFeeBps } = useReadContract({
    address: deployment?.market,
    abi: ingotMarketAbi,
    functionName: "takerFeeBps",
    query: { enabled: Boolean(deployment) },
  });

  if (!deployment) {
    return (
      <AppFrame>
        <NotDeployed />
      </AppFrame>
    );
  }

  const latest = history.at(-1);
  const previous = history.at(-25);
  const change =
    latest && previous ? ((latest.price - previous.price) / previous.price) * 100 : undefined;

  const expiry = series ? new Date(Number(series.expiry) * 1000) : undefined;
  const daysToExpiry = expiry
    ? Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86_400_000))
    : undefined;

  const position = account.position;
  const unrealized =
    position && mark && position.size !== 0n
      ? (position.size * mark) / 10n ** 30n - position.cost
      : 0n;
  const health = healthRatio(account.equity ?? 0n, account.maintenanceRequirement ?? 0n);

  return (
    <AppFrame>
      <PageHeader
        eyebrow="Terminal · H100 front month"
        title="Trade compute."
        accent="compute"
        subtitle="Go long GPU rental rates if you rent compute, short if you sell it. Cash-settled to the average index over the delivery window."
        aside={
          <div className="flex items-center gap-4 border border-hairline bg-coal px-5 py-3.5">
            <div className="flex items-center gap-4">
              <LiveDot tone="good" />
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">Mark</div>
                <div className="tnum font-mono text-[22px] text-ink">{mark ? formatPrice(mark) : "—"}</div>
              </div>
              <div className="h-9 w-px bg-hairline" />
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">Expiry</div>
                <div className="tnum font-mono text-[22px] text-ink">{daysToExpiry === undefined ? "—" : `${daysToExpiry}d`}</div>
              </div>
            </div>
          </div>
        }
      />

      <Reveal>
      <StatStrip className="grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Index"
          value={latest ? `$${latest.price.toFixed(4)}` : "—"}
          detail="USD / GPU-hour, H100 on-demand"
          accent="cobalt"
        />
        <Stat
          label="24h change"
          value={change === undefined ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
          tone={change === undefined ? "default" : change >= 0 ? "good" : "critical"}
          detail="trailing 24 prints"
          accent={change === undefined ? "violet" : change >= 0 ? "good" : "critical"}
        />
        <Stat
          label="Front contract"
          value={mark ? formatPrice(mark) : "—"}
          detail={daysToExpiry === undefined ? "no series" : `${daysToExpiry} days to expiry`}
          accent="gold"
        />
        <Stat
          label="Open interest"
          value={series ? `${formatLots(series.longOpenInterest)} lots` : "—"}
          detail={series ? `${formatHours(series.longOpenInterest)} GPU-hours` : undefined}
          accent="violet"
        />
      </StatStrip>
      </Reveal>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <Reveal delay={0.05}>
            <Card
              eyebrow="Oracle"
              title="H100 on-demand rental index"
              subtitle="Published on chain with methodology hash, sample count and venue count per print"
            >
              <IndexChart data={history} />
            </Card>
          </Reveal>

          <Reveal delay={0.1}>
            <Card eyebrow="Portfolio" title="Your position" subtitle="Marked continuously against the index">
              {!position || position.size === 0n ? (
                <Empty>No open position in the front contract. Open one from the ticket.</Empty>
              ) : (
                <div className="grid gap-x-10 sm:grid-cols-2">
                  <div>
                    <Row label="Side" value={position.size > 0n ? "Long" : "Short"} tone={position.size > 0n ? "good" : "critical"} />
                    <Row label="Size" value={`${formatLots(position.size)} lots`} />
                    <Row label="GPU-hours" value={formatHours(position.size)} />
                    <Row label="Cost basis" value={formatUsdc(position.cost)} />
                  </div>
                  <div>
                    <Row label="Unrealized" value={formatSignedUsdc(unrealized)} tone={unrealized >= 0n ? "good" : "critical"} />
                    <Row label="Equity" value={account.equity === undefined ? "—" : formatUsdc(account.equity)} />
                    <Row
                      label="Maintenance"
                      value={account.maintenanceRequirement === undefined ? "—" : formatUsdc(account.maintenanceRequirement)}
                    />
                    <Row
                      label="Health"
                      value={health === null ? "—" : `${health.toFixed(2)}×`}
                      hint={health !== null && health < 1.2 ? "at risk" : undefined}
                      tone={health === null ? "muted" : health < 1 ? "critical" : health < 1.2 ? "default" : "good"}
                    />
                  </div>
                </div>
              )}
            </Card>
          </Reveal>

          <Reveal delay={0.15}>
            <Card eyebrow="Margin" title="Collateral" subtitle="Margin is shared across every position you hold">
              <Collateral balance={account.balance} freeCollateral={account.freeCollateral} />
            </Card>
          </Reveal>

          <MarketActivity seriesId={seriesId} />
        </div>

        <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <Reveal delay={0.1}>
            <Card eyebrow="Ticket" title="Open a position" subtitle={series ? "Front contract · settles to the window average" : undefined}>
              <Ticket
                seriesId={seriesId}
                mark={mark}
                freeCollateral={account.freeCollateral}
                initialBps={account.initialBps}
                takerFeeBps={takerFeeBps as number | undefined}
              />
            </Card>
          </Reveal>

        </div>
      </div>
    </AppFrame>
  );
}
