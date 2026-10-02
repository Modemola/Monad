// Keep the market's contract calendar moving.
//
// A dated contract stops trading at expiry, and nothing on chain lists the next one or settles the
// old one. Left alone, a deployment goes dark thirty days after it is seeded: trading and new loans
// revert, and every open position waits on a settlement nobody triggers. The keeper runs this
// after each index print and sends whatever it plans:
//
//   - settle every expired series once a finalized print covers its expiry, so positions can be
//     realized and matured loans closed;
//   - realize the underwriter vault's position in each settled series, so the profit it booked
//     becomes cash underwriters can redeem (traders and the credit pool realize their own);
//   - list the next month a few days before the front month expires, delivery window starting
//     where the old one ends, so there is always a contract to trade.
//
// Read-only: it calls the chain and prints the transactions to send. Signing is the caller's job.
//
//   node tools/lifecycle.mjs --rpc <url> --market <address> --index <address>
//
// prints a JSON array of { signature, args, reason }, empty when there is nothing to do.

export const ROLL_AHEAD = 3 * 86_400; // list the next month this long before the front expires
export const TENOR = 30 * 86_400; // a month of delivery, as the seed lists
export const LOOKBACK = 6; // series checked for settlement, newest first

/// Decide what to send. Pure, so the calendar rules can be tested without a chain.
///
/// @param now Chain time, seconds.
/// @param finalizedThrough Timestamp of the newest finalized index print.
/// @param series [{ id, windowStart, expiry, settled, vaultHolds }], ids ascending.
/// @param vault The underwriter vault's market account.
export function planLifecycle({ now, finalizedThrough, series, vault }) {
  const actions = [];

  for (const s of series.slice(-LOOKBACK)) {
    const settling = !s.settled && s.expiry <= now && s.expiry <= finalizedThrough;
    if (settling) {
      actions.push({
        signature: "settleSeries(uint256)",
        args: [String(s.id)],
        reason: `series ${s.id} expired and the index is final through it`,
      });
    }
    // Only the vault. Settling the credit pool's hedge would start its shortfall grace before the
    // borrower has had the chance to close; the pool realizes its own on close or seizure.
    if ((s.settled || settling) && s.vaultHolds && vault) {
      actions.push({
        signature: "settlePosition(address,uint256)",
        args: [vault, String(s.id)],
        reason: `realize the vault's position in series ${s.id}`,
      });
    }
  }

  const last = series.at(-1);
  if (last && last.expiry - now < ROLL_AHEAD) {
    // Consecutive months: the new window opens where the last one closes. A keeper that was down
    // past that point starts the window now instead, since a window cannot open in the past of a
    // live market without settling partly on prices nobody could trade.
    const windowStart = Math.max(last.expiry, now);
    actions.push({
      signature: "listSeries(uint64,uint64,int32)",
      args: [String(windowStart), String(windowStart + TENOR), "0"],
      reason: `front series ${last.id} expires in ${Math.max(0, Math.round((last.expiry - now) / 3600))}h`,
    });
  }

  return actions;
}

// ---------------------------------------------------------------------------------------------
// Chain reads. Selectors are pinned here and checked against the Foundry build in the tests.

export const SELECTORS = {
  seriesCount: "0xd7f2c0ef", // seriesCount()
  seriesAt: "0x2b53cd6f", // seriesAt(uint256)
  finalizedThrough: "0x75466ba3", // finalizedThrough()
  vault: "0xfbfa77cf", // vault()
  positionOf: "0xa3fd0d99", // positionOf(address,uint256)
};

async function call(rpc, to, data) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`eth_call failed: ${body.error.message}`);
  return body.result;
}

async function chainTime(rpc) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: ["latest", false] }),
  });
  const body = await response.json();
  return Number(BigInt(body.result.timestamp));
}

const word = (hex, i) => BigInt("0x" + hex.slice(2 + i * 64, 2 + (i + 1) * 64));

/// `Series` is a static tuple: listedAt, windowStart, expiry, settled, basisBps, settlementPrice,
/// longOpenInterest — one word each.
export function decodeSeries(id, hex) {
  return {
    id,
    windowStart: Number(word(hex, 1)),
    expiry: Number(word(hex, 2)),
    settled: word(hex, 3) !== 0n,
  };
}

const pad = (value) => value.toString(16).padStart(64, "0");

async function readState(rpc, market, index) {
  const count = Number(BigInt(await call(rpc, market, SELECTORS.seriesCount)));
  const vault = "0x" + (await call(rpc, market, SELECTORS.vault)).slice(-40);
  const series = [];
  for (let id = Math.max(0, count - LOOKBACK); id < count; id++) {
    const s = decodeSeries(id, await call(rpc, market, SELECTORS.seriesAt + pad(id)));
    const position = await call(rpc, market, SELECTORS.positionOf + pad(BigInt(vault)) + pad(id));
    s.vaultHolds = word(position, 0) !== 0n;
    series.push(s);
  }
  const finalizedThrough = Number(BigInt(await call(rpc, index, SELECTORS.finalizedThrough)));
  return { now: await chainTime(rpc), finalizedThrough, series, vault };
}

function arg(name) {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1 || !process.argv[at + 1]) throw new Error(`missing --${name}`);
  return process.argv[at + 1];
}

if (process.argv[1] && process.argv[1].endsWith("lifecycle.mjs")) {
  readState(arg("rpc"), arg("market"), arg("index"))
    .then((state) => process.stdout.write(JSON.stringify(planLifecycle(state))))
    .catch((error) => {
      console.error(`lifecycle: ${error.message}`);
      process.exit(1);
    });
}
