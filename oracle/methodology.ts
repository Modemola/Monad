/// The Ingot index methodology, in the one place both the workflow and the simulator read it from.
///
/// It mirrors tools/build_index.py exactly, and deliberately so: the number a CRE node computes at
/// runtime has to be the same number the published methodology says it computes, or the hash in
/// `IngotIndex.methodologyHash` is decoration.
///
/// Two stages:
///   1. Per venue, the median across that venue's H100 SKUs — one observation per venue, so a
///      provider listing many SKUs cannot dominate the print.
///   2. Across venues, a 10% trimmed mean of those medians.
///
/// On-demand and secure capacity only. Spot, community and serverless are different products with
/// different availability and billing; mixing them into one print is how an index stops meaning
/// anything.

export const INCLUDED_KINDS = ["on-demand", "secure"] as const;
export const TRIM_FRACTION = 0.1;
export const MIN_VENUES = 3;

export type Offer = {
  provider: string;
  gpu: string;
  usd_hr: number;
  kind: string;
};

export type IndexPrint = {
  /// USD per GPU-hour, 18 decimals, ready for IngotIndex.
  priceWei: bigint;
  price: number;
  sampleCount: number;
  sourceCount: number;
};

export function isH100OnDemand(offer: Offer): boolean {
  return (
    typeof offer.gpu === "string" &&
    offer.gpu.toLowerCase().startsWith("h100") &&
    (INCLUDED_KINDS as readonly string[]).includes(offer.kind) &&
    typeof offer.usd_hr === "number" &&
    offer.usd_hr > 0
  );
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function trimmedMean(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * fraction);
  const kept = sorted.slice(cut, sorted.length - cut);
  const used = kept.length > 0 ? kept : sorted;
  return used.reduce((sum, value) => sum + value, 0) / used.length;
}

/// Turn a batch of venue offers into a single print, or throw if the sample is too thin to publish.
export function buildPrint(offers: Offer[]): IndexPrint {
  const byVenue = new Map<string, number[]>();
  let sampleCount = 0;

  for (const offer of offers) {
    if (!isH100OnDemand(offer)) continue;
    const existing = byVenue.get(offer.provider);
    if (existing) existing.push(offer.usd_hr);
    else byVenue.set(offer.provider, [offer.usd_hr]);
    sampleCount += 1;
  }

  if (byVenue.size < MIN_VENUES) {
    throw new Error(`too few venues to publish: ${byVenue.size} (need ${MIN_VENUES})`);
  }

  const medians = [...byVenue.values()].map(median);
  const price = trimmedMean(medians, TRIM_FRACTION);

  return {
    price,
    priceWei: toWei(price),
    sampleCount,
    sourceCount: byVenue.size,
  };
}

/// Convert a float price to 18-decimal fixed point without going through a lossy string path.
export function toWei(price: number): bigint {
  return BigInt(Math.round(price * 1e9)) * 10n ** 9n;
}
