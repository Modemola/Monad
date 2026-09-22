"""Build the Ingot H100 index series from public GPU rental price snapshots.

Source: https://github.com/adriannutiu/gpu-rental-prices (CC BY 4.0), daily
append-only snapshots of posted rental rates across 30+ providers.

Methodology, in two stages so that a provider listing many SKUs cannot dominate
the print:

  1. Per provider, per day: the median posted rate across that provider's H100
     SKUs. One observation per provider per day.
  2. Across providers: a 10% trimmed mean of those provider medians.

Universe is on-demand and secure capacity only. Spot, community and serverless
are excluded: they are different products with different availability and
billing, and mixing them into one print is how an index stops meaning anything.

Usage:  python3 tools/build_index.py <snapshot-dir> <output-csv>
"""

import csv
import json
import os
import statistics
import sys

INCLUDED_KINDS = {"on-demand", "secure"}
TRIM_FRACTION = 0.10


def h100_offers(snapshot):
    for offer in snapshot.get("offers", []):
        gpu = str(offer.get("gpu", "")).lower()
        if not gpu.startswith("h100"):
            continue
        if offer.get("kind") not in INCLUDED_KINDS:
            continue
        price = offer.get("usd_hr")
        if isinstance(price, (int, float)) and price > 0:
            yield offer["provider"], float(price)


def trimmed_mean(values, fraction):
    ordered = sorted(values)
    cut = int(len(ordered) * fraction)
    kept = ordered[cut: len(ordered) - cut] or ordered
    return statistics.fmean(kept)


def main(snapshot_dir, output_csv):
    rows = []

    for name in sorted(os.listdir(snapshot_dir)):
        if not name.endswith(".json"):
            continue

        with open(os.path.join(snapshot_dir, name)) as handle:
            snapshot = json.load(handle)

        by_provider = {}
        samples = 0
        for provider, price in h100_offers(snapshot):
            by_provider.setdefault(provider, []).append(price)
            samples += 1

        if len(by_provider) < 3:
            print(f"skipping {name}: only {len(by_provider)} providers", file=sys.stderr)
            continue

        medians = [statistics.median(prices) for prices in by_provider.values()]
        price = trimmed_mean(medians, TRIM_FRACTION)
        rows.append(
            {
                "date": snapshot["date"],
                "price_usd_per_gpu_hour": round(price, 6),
                # 18-decimal integer so the Solidity backtest can parse it without
                # implementing decimal handling in a test harness.
                "price_wei": int(round(price * 10**18)),
                "sample_count": samples,
                "source_count": len(by_provider),
            }
        )

    with open(output_csv, "w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "date",
                "price_usd_per_gpu_hour",
                "price_wei",
                "sample_count",
                "source_count",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    prices = [row["price_usd_per_gpu_hour"] for row in rows]
    print(f"{len(rows)} days -> {output_csv}")
    print(f"  range   ${min(prices):.4f} .. ${max(prices):.4f}")
    print(f"  mean    ${statistics.fmean(prices):.4f}")
    print(f"  stdev   ${statistics.stdev(prices):.4f}")
    print(f"  sources {min(r['source_count'] for r in rows)}..{max(r['source_count'] for r in rows)} providers/day")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
