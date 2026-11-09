import { z } from "zod";
import { QUANTITY, SEARCH_LIMIT, TEXT_LIMIT } from "../constants";
import { categorySlug, imageKey } from "./catalog";
import { itemLevel, mcAmount } from "./common";
import { PAGINATION } from "./pagination";

function hasAnyField(value: object): boolean {
  return Object.keys(value).length > 0;
}

/** Entry quantity (R-STK-1 S2): integer 1..9999. */
export const stockQuantity = z.number().int().min(QUANTITY.MIN).max(QUANTITY.MAX);
const entryText = (max: number) =>
  z
    .string()
    .max(max, { error: `Use at most ${max} characters` })
    .nullable();

/** Entry options / notes free text (R-STK-1 S4): <= 500 chars, null when empty. */
export const stockEntryOptions = entryText(TEXT_LIMIT.ENTRY_OPTIONS);
export const stockEntryNotes = entryText(TEXT_LIMIT.ENTRY_NOTES);

/**
 * Editable entry fields WITHOUT defaults: update derives from this, so a PATCH never resets
 * level/quantity (Zod 4 still applies an inner .default() under .partial()/.optional()).
 */
const entryFields = {
  catalogItemId: z.uuid(),
  level: itemLevel,
  quantity: stockQuantity,
  options: stockEntryOptions,
  /** Per-entry MC override (ADR4); null/omitted inherits the catalog reference price (S5). */
  priceMc: mcAmount.nullable(),
  notes: stockEntryNotes,
};

/** POST /stock (R-STK-1; options/notes <= 500, spec wins over design 21). */
export const createStockEntryInput = z.object({
  ...entryFields,
  storageLocationId: z.uuid(),
  level: itemLevel.default(0),
  quantity: stockQuantity.default(QUANTITY.MIN),
  options: entryFields.options.optional(),
  priceMc: entryFields.priceMc.optional(),
  notes: entryFields.notes.optional(),
});
export type CreateStockEntryInput = z.infer<typeof createStockEntryInput>;

/** PATCH /stock/:id: any field but the location (moves use POST /stock/:id/move). */
export const updateStockEntryInput = z
  .object(entryFields)
  .partial()
  .refine(hasAnyField, { error: "Change at least one field" });
export type UpdateStockEntryInput = z.infer<typeof updateStockEntryInput>;

/** POST /stock/:id/move (R-STK-2). */
export const moveStockEntryInput = z.object({ storageLocationId: z.uuid() });
export type MoveStockEntryInput = z.infer<typeof moveStockEntryInput>;

/** GET /stock (R-STK-4): filters + keyset cursor (opaque string from `nextCursor`). */
export const stockListQuery = z.object({
  accountId: z.uuid().optional(),
  characterId: z.uuid().optional(),
  locationId: z.uuid().optional(),
  groupId: z.uuid().optional(),
  category: categorySlug.optional(),
  q: z.string().trim().max(SEARCH_LIMIT.QUERY_MAX).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});
export type StockListQuery = z.infer<typeof stockListQuery>;

/**
 * A stock entry as the API returns it (list rows and GET /stock/:id share it). unitPriceMc is the
 * price used (override, else catalog reference); valueMc = unit * quantity, null when unpriced.
 */
export const stockEntry = z.object({
  id: z.uuid(),
  catalogItemId: z.uuid(),
  itemName: z.string(),
  itemActive: z.boolean(),
  categorySlug: z.string(),
  imageKey: imageKey.nullable(),
  level: z.number().int(),
  quantity: z.number().int(),
  options: z.string().nullable(),
  notes: z.string().nullable(),
  priceMc: mcAmount.nullable(),
  unitPriceMc: mcAmount.nullable(),
  valueMc: z.string().nullable(),
  storageLocationId: z.uuid(),
  gameAccountId: z.uuid(),
  locationLabel: z.string(),
  createdAt: z.iso.datetime(),
});
export type StockEntry = z.infer<typeof stockEntry>;

/** Keyset page: `nextCursor` is null on the last page. */
export const stockPage = z.object({
  items: z.array(stockEntry),
  nextCursor: z.string().nullable(),
});
export type StockPage = z.infer<typeof stockPage>;
