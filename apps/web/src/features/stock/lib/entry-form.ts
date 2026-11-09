import { itemLevel, mcAmount } from "@vaultkeeper/shared/schemas/common";
import {
  stockEntryNotes,
  stockEntryOptions,
  stockQuantity,
} from "@vaultkeeper/shared/schemas/stock";
import { z } from "zod";

/**
 * Stock entry form over the SHARED rules (R-STK-1): inputs are text, converted then piped into the
 * same schemas the API uses, so the errors are the API's own. Empty text = null.
 * The edit form carries the entry's current location (hidden; moves use the move dialog).
 */
const numberText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? Number.NaN : Number(value)));
const nullableText = z.string().transform((value) => (value.trim() === "" ? null : value));

export const stockEntryForm = z.object({
  catalogItemId: z.string().pipe(z.uuid({ error: "Pick an item" })),
  storageLocationId: z.string().pipe(z.uuid({ error: "Pick a location" })),
  level: numberText.pipe(itemLevel),
  quantity: numberText.pipe(stockQuantity),
  options: nullableText.pipe(stockEntryOptions),
  priceMc: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .pipe(mcAmount.nullable()),
  notes: nullableText.pipe(stockEntryNotes),
});

export type StockFormInput = z.input<typeof stockEntryForm>;
export type StockFormOutput = z.output<typeof stockEntryForm>;
