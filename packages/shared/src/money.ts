/**
 * Exact decimal money math for CLIENT PREVIEWS ONLY (ADR3). The API computes the authoritative
 * values in SQL (numeric); this mirrors it so the UI can preview "qty x price" or MC -> MP
 * before saving, without JS float drift. Amounts are decimal strings, held as BigInt cents.
 */

const MC_SCALE = 2;
const RATE_SCALE = 4;
/** Non-negative MC amount: up to 12 integer digits, up to 2 decimals (numeric(14,2)). */
export const MC_AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const RATE_PATTERN = /^\d{1,4}(\.\d{1,4})?$/;

/** Parses a non-negative decimal string into an integer scaled by 10^scale. */
function toUnits(value: string, pattern: RegExp, scale: number, label: string): bigint {
  if (!pattern.test(value)) throw new RangeError(`Invalid ${label}: ${JSON.stringify(value)}`);
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(scale, "0"));
}

function formatCents(cents: bigint): string {
  const digits = cents.toString().padStart(MC_SCALE + 1, "0");
  return `${digits.slice(0, -MC_SCALE)}.${digits.slice(-MC_SCALE)}`;
}

/** Integer division rounding half up (operands are non-negative), like Postgres round(numeric). */
function divRoundHalfUp(dividend: bigint, divisor: bigint): bigint {
  return (dividend * 2n + divisor) / (divisor * 2n);
}

const toCents = (amount: string): bigint =>
  toUnits(amount, MC_AMOUNT_PATTERN, MC_SCALE, "MC amount");

/** amount x quantity, e.g. mul("100.00", 3) === "300.00". */
export function mul(amount: string, quantity: number): string {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError(`Invalid quantity: ${quantity}`);
  }
  return formatCents(toCents(amount) * BigInt(quantity));
}

/** MC -> MP at `rate` (numeric(8,4)), rounded half up to 2 decimals: toMp("300", "7.5") === "2250.00". */
export function toMp(mc: string, rate: string): string {
  const rateUnits = toUnits(rate, RATE_PATTERN, RATE_SCALE, "rate");
  return formatCents(divRoundHalfUp(toCents(mc) * rateUnits, 10n ** BigInt(RATE_SCALE)));
}

/** Sum of priced amounts; null (unpriced) entries are skipped, never counted as 0. */
export function sum(amounts: ReadonlyArray<string | null>): string {
  let total = 0n;
  for (const amount of amounts) {
    if (amount !== null) total += toCents(amount);
  }
  return formatCents(total);
}
