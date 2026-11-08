import type { ValuationTotals } from "@vaultkeeper/shared/schemas/valuation";
import { sql, type SQL } from "drizzle-orm";
import { appSettings } from "../../db/schema";

/**
 * Aggregate columns of R-VAL-3 totals over a `lines` relation with columns `entry_id` (null on
 * outer-joined rows without an entry) and `v` (line MC, null when unpriced). Design 07: sums in
 * numeric, unpriced lines excluded from sums but counted, MP = MC x current rate rounded to 2.
 */
export const totalsColumns: SQL = sql`
  ROUND(COALESCE(SUM(v), 0), 2)::text AS total_mc,
  ROUND(COALESCE(SUM(v), 0) * (SELECT ${appSettings.mcToMpRate} FROM ${appSettings}), 2)::text AS total_mp,
  COUNT(v)::int AS priced_count,
  (COUNT(entry_id) - COUNT(v))::int AS unpriced_count`;

export type TotalsRow = {
  total_mc: string;
  total_mp: string;
  priced_count: number;
  unpriced_count: number;
};

export function toTotals(row: TotalsRow): ValuationTotals {
  return {
    totalMc: row.total_mc,
    totalMp: row.total_mp,
    pricedCount: row.priced_count,
    unpricedCount: row.unpriced_count,
    partial: row.unpriced_count > 0,
  };
}
