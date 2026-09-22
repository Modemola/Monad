/// Ingot's three scales, in one place. Getting these confused is the easiest way to
/// put a wrong number in front of someone about to risk capital, so nothing in the UI
/// formats a raw bigint without going through here.
///
///   price : USD per GPU-hour, 18 decimals
///   size  : GPU-hours, signed, 18 decimals
///   value : USDC, 6 decimals

export const LOT_HOURS = 730n * 10n ** 18n;
export const WAD = 10n ** 18n;
export const USDC = 10n ** 6n;

function fixed(value: bigint, decimals: bigint, places: number): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const scale = 10n ** decimals;
  const whole = magnitude / scale;
  const fraction = magnitude % scale;

  const padded = fraction.toString().padStart(Number(decimals), "0").slice(0, places);
  const body = places > 0 ? `${whole.toString()}.${padded}` : whole.toString();
  return negative ? `-${body}` : body;
}

function withThousands(text: string): string {
  const [whole, fraction] = text.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${sign}${grouped}.${fraction}` : `${sign}${grouped}`;
}

/// USD per GPU-hour, e.g. "$2.2474".
export function formatPrice(price: bigint, places = 4): string {
  return `$${fixed(price, 18n, places)}`;
}

/// USDC amounts, e.g. "$166,300.87". Always two places — this is money.
export function formatUsdc(value: bigint, places = 2): string {
  const sign = value < 0n ? "-" : "";
  const body = withThousands(fixed(value < 0n ? -value : value, 6n, places));
  return `${sign}$${body}`;
}

/// USDC with an explicit sign, for PnL columns.
export function formatSignedUsdc(value: bigint, places = 2): string {
  const formatted = formatUsdc(value, places);
  return value > 0n ? `+${formatted}` : formatted;
}

/// GPU-hours, e.g. "100,000".
export function formatHours(size: bigint, places = 0): string {
  const sign = size < 0n ? "-" : "";
  return `${sign}${withThousands(fixed(size < 0n ? -size : size, 18n, places))}`;
}

/// Position size expressed in lots, e.g. "-137.0".
export function formatLots(size: bigint, places = 1): string {
  const sign = size < 0n ? "-" : "";
  const magnitude = size < 0n ? -size : size;
  const lots = (magnitude * WAD) / LOT_HOURS;
  return `${sign}${withThousands(fixed(lots, 18n, places))}`;
}

export function formatBps(bps: number | bigint): string {
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

/// Parse a user-typed decimal into a scaled bigint. Returns null on anything unparseable
/// so callers can disable the action rather than submit a silently-wrong number.
export function parseDecimal(input: string, decimals: number): bigint | null {
  const trimmed = input.trim();
  if (trimmed === "" || !/^\d*\.?\d*$/.test(trimmed)) return null;

  const [whole = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) return null;

  const padded = fraction.padEnd(decimals, "0");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/// Health as a ratio of equity to maintenance requirement. Returns null when there is
/// no requirement, which means there is no position to be unhealthy about.
export function healthRatio(equity: bigint, maintenance: bigint): number | null {
  if (maintenance === 0n) return null;
  return Number((equity * 1000n) / maintenance) / 1000;
}
