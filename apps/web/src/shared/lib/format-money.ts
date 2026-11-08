import type { ValuationTotals } from "@vaultkeeper/shared/schemas/valuation";

/** Unpriced placeholder (R-VAL-1 S3): never shown as 0. */
export const UNPRICED = "-";

/** Any non-negative decimal: totals (MP especially) are not bounded like numeric(14,2). */
const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/**
 * Display text of an MC/MP decimal string: 2 decimals, thousands grouped, no float conversion.
 * null (unpriced) -> "-".
 */
export function formatMoney(amount: string | null): string {
  if (amount === null) return UNPRICED;
  const match = DECIMAL.exec(amount);
  if (!match) return amount;
  const [, whole = "0", fraction = ""] = match;
  const cents = fraction.padEnd(2, "0").slice(0, 2);
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

/** A total whose lines are ALL unpriced has no value ("-"); an empty set is a real 0.00. */
export function formatTotal(totals: ValuationTotals, field: "totalMc" | "totalMp"): string {
  if (totals.pricedCount === 0 && totals.unpricedCount > 0) return UNPRICED;
  return formatMoney(totals[field]);
}

export function unpricedLabel(count: number, suffix = "without price"): string {
  return `${count} item${count === 1 ? "" : "s"} ${suffix}`;
}
