"use client";

import { useReadContract } from "wagmi";

import { IndexChart } from "@/components/charts";
import { Collateral } from "@/components/Collateral";
import { Ticket } from "@/components/Ticket";
import { Card, Empty, Row, Stat } from "@/components/ui";
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
      <Card title="Not deployed here">
        <Empty>
          Ingot is not deployed on this network. Switch to Monad Testnet.
        </Empty>
      </Card>
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Index"
          value={latest ? `$${latest.price.toFixed(4)}` : "—"}
          detail="USD / GPU-hour, H100 on-demand"
        />
        <Stat
          label="24h change"
          value={change === undefined ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
          tone={change === undefined ? "default" : change >= 0 ? "good" : "critical"}
          detail="trailing 24 prints"
        />
        <Stat
          label="Front contract"
          value={mark ? formatPrice(mark) : "—"}
          detail={daysToExpiry === undefined ? "no series" : `${daysToExpiry} days to expiry`}
        />
        <Stat
          label="Open interest"
          value={series ? `${formatLots(series.longOpenInterest)} lots` : "—"}
          detail={series ? `${formatHours(series.longOpenInterest)} GPU-hours` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card
            title="H100 on-demand rental index"
            subtitle="Published on chain with methodology hash, sample count and venue count per print"
          >
            <IndexChart data={history} />
          </Card>

          <Card title="Your position" subtitle="Marked continuously against the index">
            {!position || position.size === 0n ? (
              <Empty>No open position in the front contract.</Empty>
            ) : (
              <div className="grid gap-x-8 sm:grid-cols-2">
                <div>
                  <Row
                    label="Side"
                    value={position.size > 0n ? "Long" : "Short"}
                    tone={position.size > 0n ? "good" : "critical"}
                  />
                  <Row label="Size" value={`${formatLots(position.size)} lots`} />
                  <Row label="GPU-hours" value={formatHours(position.size)} />
                  <Row label="Cost basis" value={formatUsdc(position.cost)} />
                </div>
                <div>
                  <Row
                    label="Unrealized"
                    value={formatSignedUsdc(unrealized)}
                    tone={unrealized >= 0n ? "good" : "critical"}
                  />
                  <Row label="Equity" value={account.equity === undefined ? "—" : formatUsdc(account.equity)} />
                  <Row
                    label="Maintenance"
                    value={
                      account.maintenanceRequirement === undefined
                        ? "—"
                        : formatUsdc(account.maintenanceRequirement)
                    }
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
        </div>

        <div className="space-y-4">
          <Card title="Ticket" subtitle={series ? `Front contract · settles to window average` : undefined}>
            <Ticket
              seriesId={seriesId}
              mark={mark}
              freeCollateral={account.freeCollateral}
              initialBps={account.initialBps}
              takerFeeBps={takerFeeBps as number | undefined}
            />
          </Card>

          <Card title="Collateral">
            <Collateral balance={account.balance} freeCollateral={account.freeCollateral} />
          </Card>
        </div>
      </div>
    </div>
  );
}
