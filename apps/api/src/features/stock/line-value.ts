import { sql, type SQL } from "drizzle-orm";
import { catalogItems, stockEntries } from "../../db/schema";

/**
 * Line valuation SQL (design 07), shared by the stock list and valuation queries so both always
 * agree. Requires stock_entries JOIN catalog_items in the query.
 */

/** Unit MC used: the entry override, else the catalog reference price (null = unpriced). */
export const unitPriceMc: SQL<string | null> = sql<
  string | null
>`COALESCE(${stockEntries.priceMc}, ${catalogItems.referencePriceMc})`;

/** unit * quantity, exact numeric; null when unpriced (excluded from totals, counted apart). */
export const lineValueMc: SQL<string | null> = sql<
  string | null
>`(COALESCE(${stockEntries.priceMc}, ${catalogItems.referencePriceMc}) * ${stockEntries.quantity})`;
