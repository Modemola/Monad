# What 78 days of real H100 prices say

The series in `contracts/data/h100_index.csv` is built by `tools/build_index.py` from the public
[gpu-rental-prices](https://github.com/adriannutiu/gpu-rental-prices) dataset (CC BY 4.0): daily
snapshots of posted rental rates across 30+ providers, 2026-07-06 to 2026-09-21.

**Methodology.** Per provider per day, the median across that provider's H100 SKUs — one
observation per provider, so a provider listing many SKUs cannot dominate the print. Then a 10%
trimmed mean across provider medians. On-demand and secure capacity only; spot, community and
serverless are excluded as different products.

Reproduce with `python3 tools/build_index.py <snapshot-dir> contracts/data/h100_index.csv`.

## The window

| | |
|---|---|
| Days | 78, no gaps |
| Index range | $3.1244 – $3.9075 / GPU-hour |
| Mean | $3.6399 |
| Standard deviation | $0.1029 (2.83% of mean) |
| Daily volatility | 3.13% — **59.8% annualised** |
| Max drawdown | −10.19% |
| Peak to trough | 25% |

Posted on-demand rates are sticky day to day, which makes the raw standard deviation look small.
Annualised, the same series is a 60%-volatility commodity.

## Dispersion: what "no price discovery" looks like

On an average day in this window, the dearest provider's posted H100 rate was **6.14x** the
cheapest. At the widest, 6.18x. Every day, all 78 days.

## Basis: the finding that changed the product

Measured across the 23 providers present on 60+ days, provider rates sit anywhere from **45% below
the index to 237% above it** — hyperscalers at the top, neoclouds at the bottom.

But the *tracking error* — the standard deviation of each provider's basis against the index — has
a **median of 3.1%**. Levels differ enormously; movement does not.

```
provider          days   mean basis   basis stdev
voltagepark         78       -45.3%          1.6%
gmicloud            64       -44.8%          1.0%
tensordock          66       -37.9%          1.1%
runpod              78       -14.3%          3.8%
lambda              78         0.1%          3.0%
crusoe              78         7.2%          3.2%
coreweave           78        69.2%          5.0%
aws                 77       237.2%          7.7%
```

This is why `HedgedCredit` sizes each hedge by a **basis ratio** rather than raw GPU-hours. An
operator selling at 55% of the index who hedged 1:1 on hour count would be over-hedged by nearly a
factor of two, and the residual would not be small. The hedge is `offtake × basis`, which is also
the quantity the advance is measured against.

Reproduce with `python3 tools/analyse_basis.py <snapshot-dir>`.

## The backtest, and its negative result

`contracts/test/Backtest.t.sol` replays the series through the real contracts — real index, real
market, real credit pool, real settlement. It walks a 30-day contract forward, rolling every
fortnight, opening a hedged loan at each listing and settling at expiry.

**Four cohorts completed. Hedged and unhedged recovery were identical in all four.**

| Opened | Settled | Struck | Settlement | Hedged | Unhedged |
|---|---|---|---|---|---|
| 2026-07-08 | 2026-08-07 | $3.873 | $3.644 | $143,050 | $143,050 |
| 2026-07-23 | 2026-08-22 | $3.647 | $3.618 | $134,705 | $134,705 |
| 2026-08-07 | 2026-09-06 | $3.670 | $3.673 | $135,554 | $135,554 |
| 2026-08-22 | 2026-09-21 | $3.564 | $3.636 | $131,636 | $131,636 |

The hedge rescued nobody in this window. Reporting it otherwise would be dishonest, and any judge
who ran the numbers would find out.

## What the hedge is actually worth

The reason nothing broke is that the terms are conservative. At a 70% advance with the borrower
posting 20% margin, the first cohort's unhedged lender does not take a loss until the rate settles
at **$1.661** against a strike of **$3.873** — a **57.1% cushion**. The window's worst settlement
was **5.9%** below its strike.

That cushion is not free. It is the advance rate the borrower does not get.

The hedged lender has no cushion because it needs none: recovery equals the debt at every
settlement price tested, from the strike down to a tenth of it. The product is not insurance
against a crash that may not come — it is the removal of the cushion, and therefore a larger
advance against the same risk appetite.

## Honest limits

- **78 days is short.** The dataset begins 2026-07-05. Two and a half months cannot speak to a
  12-month reserved contract, which is where the real exposure sits.
- **Posted rates, not transacted rates.** These are list prices scraped from provider pages.
  Actual contracted rates, especially for reserved capacity, are private.
- **The backtest overlaps its cohorts.** Rolling every fortnight on a 30-day contract means the
  four cohorts are not independent observations.
