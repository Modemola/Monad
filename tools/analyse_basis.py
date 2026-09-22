"""Measure the risks the Ingot index is actually exposed to.

Time-series volatility of posted on-demand rates is low — they are sticky. The
risks that matter to a hedger are different, and both are measurable from the
same data:

  basis risk   how far an individual provider's realized rate sits from the
               index it would settle against. A hedge only works to the extent
               the index tracks the hedger's own revenue.

  dispersion   how wide the market is on any given day. This is what "no price
               discovery" looks like numerically.
"""

import json
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(__file__))
from build_index import h100_offers, trimmed_mean, TRIM_FRACTION


def main(snapshot_dir):
    daily = []

    for name in sorted(os.listdir(snapshot_dir)):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(snapshot_dir, name)) as handle:
            snapshot = json.load(handle)

        by_provider = {}
        for provider, price in h100_offers(snapshot):
            by_provider.setdefault(provider, []).append(price)
        if len(by_provider) < 3:
            continue

        medians = {p: statistics.median(v) for p, v in by_provider.items()}
        daily.append((snapshot["date"], trimmed_mean(list(medians.values()), TRIM_FRACTION), medians))

    prices = [index for _, index, _ in daily]

    print(f"window            {daily[0][0]} .. {daily[-1][0]}  ({len(daily)} days)")
    print(f"index range       ${min(prices):.4f} .. ${max(prices):.4f}")
    print(f"index mean        ${statistics.fmean(prices):.4f}")
    print(f"index stdev       ${statistics.stdev(prices):.4f}  ({statistics.stdev(prices)/statistics.fmean(prices)*100:.2f}% of mean)")

    returns = [(prices[i] / prices[i - 1] - 1) for i in range(1, len(prices))]
    daily_vol = statistics.stdev(returns)
    print(f"daily vol         {daily_vol*100:.2f}%   annualised {daily_vol*(365**0.5)*100:.1f}%")

    peak = prices[0]
    drawdown = 0.0
    for price in prices:
        peak = max(peak, price)
        drawdown = min(drawdown, price / peak - 1)
    print(f"max drawdown      {drawdown*100:.2f}%")

    print("\n-- cross-venue dispersion, per day --")
    spreads = []
    for _, _, medians in daily:
        values = list(medians.values())
        spreads.append(max(values) / min(values))
    print(f"cheapest to dearest provider: {statistics.fmean(spreads):.2f}x on average, "
          f"{max(spreads):.2f}x at the widest")

    print("\n-- basis: provider rate vs index, providers seen on 60+ days --")
    per_provider = {}
    for _, index, medians in daily:
        for provider, price in medians.items():
            per_provider.setdefault(provider, []).append(price / index - 1)

    rows = [(p, len(b), statistics.fmean(b), statistics.stdev(b) if len(b) > 1 else 0.0)
            for p, b in per_provider.items() if len(b) >= 60]
    rows.sort(key=lambda r: r[2])

    print(f"{'provider':<16}{'days':>6}{'mean basis':>13}{'basis stdev':>14}")
    for provider, days, mean_basis, stdev_basis in rows:
        print(f"{provider:<16}{days:>6}{mean_basis*100:>12.1f}%{stdev_basis*100:>13.1f}%")

    tracking = [stdev for _, _, _, stdev in rows]
    print(f"\nmedian tracking error across providers: {statistics.median(tracking)*100:.1f}%")


if __name__ == "__main__":
    main(sys.argv[1])
