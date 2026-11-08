import { z } from "zod";
import { STORAGE_KIND } from "../constants";

/**
 * Totals of a set of entries (R-VAL-3): sums EXCLUDE unpriced lines (never counted as 0), MP is
 * derived from MC with the current rate in SQL (never stored), partial = unpricedCount > 0.
 */
export const valuationTotals = z.object({
  totalMc: z.string(),
  totalMp: z.string(),
  pricedCount: z.number().int(),
  unpricedCount: z.number().int(),
  partial: z.boolean(),
});
export type ValuationTotals = z.infer<typeof valuationTotals>;

export const accountValuation = valuationTotals.extend({
  accountId: z.uuid(),
  accountName: z.string(),
});
export type AccountValuation = z.infer<typeof accountValuation>;

/** Per location; a character's total is its inventory row ("Inventory – <name>"). */
export const locationValuation = valuationTotals.extend({
  locationId: z.uuid(),
  accountId: z.uuid(),
  kind: z.enum([STORAGE_KIND.INVENTORY, STORAGE_KIND.VAULT]),
  label: z.string(),
  characterId: z.uuid().nullable(),
});
export type LocationValuation = z.infer<typeof locationValuation>;

/** GET /valuation/summary?accountId: overall totals plus the per-account / per-location split. */
export const valuationSummary = z.object({
  mcToMpRate: z.string(),
  totals: valuationTotals,
  byAccount: z.array(accountValuation),
  byLocation: z.array(locationValuation),
});
export type ValuationSummary = z.infer<typeof valuationSummary>;

export const valuationSummaryQuery = z.object({ accountId: z.uuid().optional() });
export type ValuationSummaryQuery = z.infer<typeof valuationSummaryQuery>;
