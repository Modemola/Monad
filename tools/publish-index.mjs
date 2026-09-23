// Compute the current Ingot H100 index print from public rental-rate data.
//
// Pure computation: fetches the source, applies the published methodology, and writes the
// print to stdout as JSON. It never touches a key — signing is the caller's job — so this
// can be run and checked by anyone.
//
//   node tools/publish-index.mjs            # human-readable
//   node tools/publish-index.mjs --json     # machine-readable, for the keeper workflow
//
// Methodology, identical to tools/build_index.py which built the backtest series:
//   1. Per provider: the median across that provider's H100 SKUs, so a provider listing many
//      SKUs cannot dominate the print.
//   2. Across providers: a 10% trimmed mean of those medians.
// Universe is on-demand and secure capacity only — spot, community and serverless are
// different products with different availability, and mixing them makes the index meaningless.

const SOURCE = "https://raw.githubusercontent.com/adriannutiu/gpu-rental-prices/main/data/latest.json";
const INCLUDED_KINDS = new Set(["on-demand", "secure"]);
const TRIM_FRACTION = 0.1;
const MIN_SOURCES = 3;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function trimmedMean(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * fraction);
  const kept = sorted.slice(cut, sorted.length - cut);
  const body = kept.length ? kept : sorted;
  return body.reduce((sum, value) => sum + value, 0) / body.length;
}

/// Six decimal places is far more precision than a rental rate carries, and avoids the
/// float error that `price * 1e18` would introduce at the top of the range.
function toWei(price) {
  return BigInt(Math.round(price * 1e6)) * 10n ** 12n;
}

export function computePrint(snapshot) {
  const byProvider = new Map();
  let sampleCount = 0;

  for (const offer of snapshot.offers ?? []) {
    const gpu = String(offer.gpu ?? "").toLowerCase();
    if (!gpu.startsWith("h100")) continue;
    if (!INCLUDED_KINDS.has(offer.kind)) continue;
    if (typeof offer.usd_hr !== "number" || !(offer.usd_hr > 0)) continue;

    if (!byProvider.has(offer.provider)) byProvider.set(offer.provider, []);
    byProvider.get(offer.provider).push(offer.usd_hr);
    sampleCount += 1;
  }

  if (byProvider.size < MIN_SOURCES) {
    throw new Error(
      `only ${byProvider.size} providers in the snapshot, need at least ${MIN_SOURCES} — refusing to publish`,
    );
  }

  const medians = [...byProvider.values()].map(median);
  const price = trimmedMean(medians, TRIM_FRACTION);

  return {
    date: snapshot.date,
    generatedAt: snapshot.generated_at,
    price: Number(price.toFixed(6)),
    priceWei: toWei(price).toString(),
    sampleCount,
    sourceCount: byProvider.size,
  };
}

async function main() {
  const response = await fetch(SOURCE, { headers: { "user-agent": "ingot-index-keeper" } });
  if (!response.ok) throw new Error(`source returned ${response.status}`);

  const print = computePrint(await response.json());

  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(print));
    return;
  }

  console.log(`Ingot H100 index — ${print.date}`);
  console.log(`  price        $${print.price.toFixed(4)} / GPU-hour`);
  console.log(`  price (wei)  ${print.priceWei}`);
  console.log(`  built from   ${print.sampleCount} quotes across ${print.sourceCount} venues`);
}

if (process.argv[1] && process.argv[1].endsWith("publish-index.mjs")) {
  main().catch((error) => {
    console.error(`publish-index: ${error.message}`);
    process.exit(1);
  });
}
