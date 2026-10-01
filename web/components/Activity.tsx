"use client";

import { Card, Empty, Row } from "@/components/ui";
import { formatHours, formatLots, formatPrice, formatSignedUsdc, formatUsdc, shortAddress } from "@/lib/format";
import { INDEXER_URL, big, useIndexer } from "@/lib/indexer";

type Num = string | number;

const MARKET = /* GraphQL */ `
  query Market($series: String!) {
    Trade(where: { series_id: { _eq: $series } }, order_by: [{ blockNumber: desc }, { id: desc }], limit: 12) {
      id
      account_id
      size
      price
      fee
      timestamp
      txHash
    }
    Series(where: { id: { _eq: $series } }) {
      vaultInventory
      tradeCount
      notionalVolume
    }
    Protocol {
      traders
      liquidations
      badDebt
    }
  }
`;

type MarketData = {
  Trade: { id: string; account_id: string; size: Num; price: Num; fee: Num; timestamp: Num; txHash: string }[];
  Series: { vaultInventory: Num; tradeCount: number; notionalVolume: Num }[];
  Protocol: { traders: number; liquidations: number; badDebt: Num }[];
};

function time(seconds: Num) {
  return new Date(Number(seconds) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/// The trade tape and the vault's book for the front series. The vault never trades directly,
/// so its inventory is derived by the indexer from every other fill — the contract only
/// exposes it one account at a time.
export function MarketActivity({ seriesId }: { seriesId: bigint | undefined }) {
  const { data, isError } = useIndexer<MarketData>("market", MARKET, { series: seriesId?.toString() ?? "" });

  if (!INDEXER_URL || seriesId === undefined) return null;

  const series = data?.Series[0];
  const protocol = data?.Protocol[0];
  const inventory = big(series?.vaultInventory);

  return (
    <Card eyebrow="Envio HyperIndex" title="Market activity" subtitle="Every fill, both sides of it, including the vault's">
      {isError ? (
        <Empty>Indexer unreachable. Trading is unaffected: it reads the contracts directly.</Empty>
      ) : (
        <div className="grid gap-x-8 gap-y-4 lg:grid-cols-[220px_1fr]">
          <div>
            <Row label="Vault inventory" value={series ? `${formatLots(inventory)} lots` : "—"} />
            <Row
              label="Traders are net"
              value={series ? (inventory === 0n ? "flat" : inventory < 0n ? "long" : "short") : "—"}
            />
            <Row label="Trades" value={series ? series.tradeCount.toLocaleString() : "—"} />
            <Row label="Volume" value={series ? formatUsdc(big(series.notionalVolume), 0) : "—"} />
            <Row label="Traders" value={protocol ? protocol.traders.toLocaleString() : "—"} />
            <Row
              label="Liquidations"
              value={protocol ? protocol.liquidations.toLocaleString() : "—"}
              hint={protocol && big(protocol.badDebt) > 0n ? `${formatUsdc(big(protocol.badDebt), 0)} bad debt` : undefined}
            />
          </div>

          <div className="min-w-0 overflow-x-auto">
            {data && data.Trade.length === 0 ? (
              <Empty>No trades in this series yet.</Empty>
            ) : (
              <table className="w-full text-left text-[12px]">
                <thead className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                  <tr className="border-b border-hairline">
                    <th className="pb-2 font-normal">Time</th>
                    <th className="pb-2 font-normal">Side</th>
                    <th className="pb-2 text-right font-normal">Lots</th>
                    <th className="pb-2 text-right font-normal">Price</th>
                    <th className="pb-2 text-right font-normal">Account</th>
                  </tr>
                </thead>
                <tbody className="tnum font-mono text-[12px]">
                  {(data?.Trade ?? []).map((trade) => {
                    const size = big(trade.size);
                    return (
                      <tr key={trade.id} className="border-b border-hairline last:border-0">
                        <td className="py-1.5 text-ink-muted">{time(trade.timestamp)}</td>
                        <td className={`py-1.5 ${size > 0n ? "text-good" : "text-critical"}`}>
                          {size > 0n ? "Buy" : "Sell"}
                        </td>
                        <td className="py-1.5 text-right">{formatLots(size < 0n ? -size : size)}</td>
                        <td className="py-1.5 text-right">{formatPrice(big(trade.price))}</td>
                        <td className="py-1.5 text-right text-ink-muted">{shortAddress(trade.account_id)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

const LOANS = /* GraphQL */ `
  query Loans {
    Loan(order_by: { loanId: desc }, limit: 20) {
      id
      borrower_id
      status
      basisRatioBps
      hedgeSize
      hedgeEntryPrice
      principal
      interest
      hedgePnl
      netOwed
      maturity
    }
    Protocol {
      loansOpened
      loansOpen
      principalOutstanding
      hedgePnlRealized
    }
  }
`;

type LoansData = {
  Loan: {
    id: string;
    borrower_id: string;
    status: "Open" | "Closed" | "Seized";
    basisRatioBps: number;
    hedgeSize: Num;
    hedgeEntryPrice: Num;
    principal: Num;
    interest: Num;
    hedgePnl: Num | null;
    netOwed: Num | null;
    maturity: Num;
  }[];
  Protocol: { loansOpened: number; loansOpen: number; principalOutstanding: Num; hedgePnlRealized: Num }[];
};

/// Every loan on the protocol, with what its hedge did at settlement. Rebuilt from events
/// alone: LoanOpened carries the full terms, LoanClosed the outcome.
export function LoanBook() {
  const { data, isError } = useIndexer<LoansData>("loans", LOANS);

  if (!INDEXER_URL) return null;

  const protocol = data?.Protocol[0];

  return (
    <Card
      eyebrow="Envio HyperIndex"
      title="Loan book"
      subtitle={
        protocol
          ? `${protocol.loansOpen} open of ${protocol.loansOpened} · ${formatUsdc(big(protocol.principalOutstanding), 0)} outstanding · hedges have returned ${formatSignedUsdc(big(protocol.hedgePnlRealized), 0)}`
          : "Indexed by Envio HyperIndex"
      }
    >
      {isError ? (
        <Empty>Indexer unreachable. Borrowing is unaffected: it reads the contracts directly.</Empty>
      ) : data && data.Loan.length === 0 ? (
        <Empty>No loans yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
              <tr className="border-b border-hairline">
                <th className="pb-2 font-normal">Loan</th>
                <th className="pb-2 font-normal">Borrower</th>
                <th className="pb-2 font-normal">Basis</th>
                <th className="pb-2 text-right font-normal">Hedge</th>
                <th className="pb-2 text-right font-normal">Struck at</th>
                <th className="pb-2 text-right font-normal">Debt</th>
                <th className="pb-2 text-right font-normal">Hedge PnL</th>
                <th className="pb-2 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="tnum font-mono text-[12px]">
              {(data?.Loan ?? []).map((loan) => {
                const pnl = loan.hedgePnl === null ? undefined : big(loan.hedgePnl);
                return (
                  <tr key={loan.id} className="border-b border-hairline last:border-0">
                    <td className="py-1.5 text-ink-muted">#{loan.id}</td>
                    <td className="py-1.5 text-ink-muted">{shortAddress(loan.borrower_id)}</td>
                    <td className="py-1.5">{(loan.basisRatioBps / 100).toFixed(0)}%</td>
                    <td className="py-1.5 text-right">{formatHours(big(loan.hedgeSize))} hrs</td>
                    <td className="py-1.5 text-right">{formatPrice(big(loan.hedgeEntryPrice))}</td>
                    <td className="py-1.5 text-right">{formatUsdc(big(loan.principal) + big(loan.interest), 0)}</td>
                    <td
                      className={`py-1.5 text-right ${
                        pnl === undefined ? "text-ink-muted" : pnl >= 0n ? "text-good" : "text-critical"
                      }`}
                    >
                      {pnl === undefined ? "open" : formatSignedUsdc(pnl, 0)}
                    </td>
                    <td className="py-1.5 text-right text-ink-muted">{loan.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
