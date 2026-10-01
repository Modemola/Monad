"use client";

import { useAccount, useReadContract } from "wagmi";

import { MarketActivity } from "@/components/Activity";
import { IndexChart } from "@/components/charts";
import { Collateral } from "@/components/Collateral";
import { Reveal } from "@/components/fx/motion";
import { NotDeployed } from "@/components/NotDeployed";
import { PositionPanel } from "@/components/Position";
import { AppFrame, PageHeader } from "@/components/PageHeader";
import { Ticket } from "@/components/Ticket";
import { Card, Empty, LiveDot, Row, Stat, StatStrip } from "@/components/ui";
import { ingotMarketAbi } from "@/lib/abis";
import { useAccountState, useDeployment, useFrontSeries, useIndexHistory } from "@/lib/useIngot";
import {
  formatHours,
  formatLots,
  formatPrice,
} from "@/lib/format";

/// When the newest print was taken, in UTC, so a stale index is never mistaken for a live one.
function asOf(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const ageHours = (Date.now() - date.getTime()) / 3_600_000;
  if (ageHours < 1) return "under an hour ago";
  if (ageHours < 48) return `${Math.round(ageHours)}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function Terminal() {
  const { deployment } = useDeployment();
  const { seriesId, series, mark } = useFrontSeries();
  const history = useIndexHistory();
  const account = useAccountState(seriesId);

  const { address } = useAccount();
  const { data: openSeries } = useReadContract({
    address: deployment?.market,
    abi: ingotMarketAbi,
    functionName: "openSeriesOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(deployment && address) },
  });

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

  // Change against the last print at least a day older than the latest. The history mixes the
  // daily backfill with the publisher's six-hourly prints, so counting prints back is not a day.
  const latest = history.at(-1);
  const previous = latest ? history.findLast((p) => p.timestamp <= latest.timestamp - 86_400) : undefined;
  const change =
    latest && previous ? ((latest.price - previous.price) / previous.price) * 100 : undefined;
  const changeSpanHours = latest && previous ? (latest.timestamp - previous.timestamp) / 3600 : 0;
  const changeIsDaily = changeSpanHours <= 30;

  const expiry = series ? new Date(Number(series.expiry) * 1000) : undefined;
  const daysToExpiry = expiry
    ? Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86_400_000))
    : undefined;

  const position = account.position;

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
          detail={latest ? `USD / GPU-hr · as of ${asOf(latest.timestamp)}` : "USD / GPU-hour, H100 on-demand"}
          accent="cobalt"
        />
        <Stat
          label={changeIsDaily ? "24h change" : "Change"}
          value={change === undefined ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
          tone={change === undefined ? "default" : change >= 0 ? "good" : "critical"}
          detail={
            !previous
              ? "needs a day of prints"
              : changeIsDaily
                ? "vs the print a day earlier"
                : `since the ${new Date(previous.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} print`
          }
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

      {/* One grid, so phones read chart → ticket → position → collateral (the ticket is the page's
          main action), while desktop keeps the ticket in a sticky right column spanning the rest.
          The last row is flexible so the ticket's height never opens gaps between left cards. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px] lg:grid-rows-[auto_auto_auto_1fr]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Reveal delay={0.05}>
            <Card
              eyebrow="Oracle"
              title="H100 on-demand rental index"
              subtitle="Published on chain with methodology hash, sample count and venue count per print"
            >
              <IndexChart data={history} />
            </Card>
          </Reveal>
        </div>

        <div className="lg:sticky lg:top-28 lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:self-start">
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

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <Reveal delay={0.1}>
            <Card eyebrow="Portfolio" title="Your position" subtitle="Marked continuously against the index">
              <PositionPanel
                seriesId={seriesId}
                position={position}
                mark={mark}
                equity={account.equity}
                maintenanceRequirement={account.maintenanceRequirement}
                maintenanceBps={account.maintenanceBps}
                onlyPosition={(openSeries?.length ?? 0) <= 1}
              />
            </Card>
          </Reveal>
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-start-3">
          <Reveal delay={0.15}>
            <Card eyebrow="Margin" title="Collateral" subtitle="Margin is shared across every position you hold">
              <Collateral balance={account.balance} freeCollateral={account.freeCollateral} />
            </Card>
          </Reveal>
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-start-4">
          <MarketActivity seriesId={seriesId} />
        </div>
      </div>
    </AppFrame>
  );
}
