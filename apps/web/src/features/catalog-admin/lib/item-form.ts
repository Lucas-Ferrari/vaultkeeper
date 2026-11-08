import { catalogItemName, categorySlug } from "@vaultkeeper/shared/schemas/catalog";
import { mcAmount } from "@vaultkeeper/shared/schemas/common";
import { z } from "zod";

/**
 * Edit form over the SHARED rules (same as the API): the price field is text, empty = unpriced.
 * Errors come from mcAmount itself (pipe), so the UI shows the API's own wording.
 */
export const itemEditForm = z.object({
  name: catalogItemName,
  categorySlug,
  referencePriceMc: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .pipe(mcAmount.nullable()),
});
export type ItemEditFormInput = z.input<typeof itemEditForm>;
export type ItemEditFormOutput = z.output<typeof itemEditForm>;
