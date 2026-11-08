import { z } from "zod";
import {
  CATALOG_SOURCE,
  CATEGORY_LIMIT,
  CATEGORY_SLUG_PATTERN,
  SEARCH_LIMIT,
  TEXT_LIMIT,
} from "../constants";
import { mcAmount } from "./common";
import { paginationQuery } from "./pagination";

/** Item name (R-CAT-1): trimmed, 1..120 chars, accents preserved. */
export const catalogItemName = z
  .string()
  .trim()
  .min(1, { error: "Enter a name" })
  .max(TEXT_LIMIT.CATALOG_ITEM_NAME, {
    error: `Use at most ${TEXT_LIMIT.CATALOG_ITEM_NAME} characters`,
  });

/** Category slug: the category PK, lowercase letters, digits and dashes. */
export const categorySlug = z
  .string()
  .max(CATEGORY_LIMIT.SLUG_MAX)
  .regex(CATEGORY_SLUG_PATTERN, { error: "Use lowercase letters, digits and dashes" });

/** POST /admin/catalog/items. isActive is left to the DB default (true) when omitted. */
export const createCatalogItemInput = z.object({
  categorySlug,
  name: catalogItemName,
  referencePriceMc: mcAmount.nullable().optional(),
  isActive: z.boolean().optional(),
});
export type CreateCatalogItemInput = z.infer<typeof createCatalogItemInput>;

function hasAnyField(value: object): boolean {
  return Object.keys(value).length > 0;
}

/** PATCH /admin/catalog/items/:id: any field (R-CAT-2), at least one. */
export const updateCatalogItemInput = createCatalogItemInput
  .partial()
  .refine(hasAnyField, { error: "Change at least one field" });
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemInput>;

const categoryName = z
  .string()
  .trim()
  .min(1, { error: "Enter a name" })
  .max(CATEGORY_LIMIT.NAME_MAX, { error: `Use at most ${CATEGORY_LIMIT.NAME_MAX} characters` });
const categoryIcon = z.string().trim().min(1).max(CATEGORY_LIMIT.ICON_MAX);
const categorySortOrder = z.number().int().min(0).max(CATEGORY_LIMIT.SORT_ORDER_MAX);

/** POST /admin/catalog/categories. */
export const createCategoryInput = z.object({
  slug: categorySlug,
  name: categoryName,
  icon: categoryIcon,
  sortOrder: categorySortOrder.default(0),
});
export type CreateCategoryInput = z.infer<typeof createCategoryInput>;

/** PATCH /admin/catalog/categories/:slug (the slug is the PK: not editable, stripped). */
export const updateCategoryInput = z
  .object({ name: categoryName, icon: categoryIcon, sortOrder: categorySortOrder })
  .partial()
  .refine(hasAnyField, { error: "Change at least one field" });
export type UpdateCategoryInput = z.infer<typeof updateCategoryInput>;

/** GET /catalog/items (any user, active only): fuzzy q, category filter, offset paging. */
export const catalogSearchQuery = paginationQuery.extend({
  q: z.string().trim().max(SEARCH_LIMIT.QUERY_MAX).optional(),
  category: categorySlug.optional(),
});
export type CatalogSearchQuery = z.infer<typeof catalogSearchQuery>;

/**
 * GET /admin/catalog/items: same search plus inactive items. `includeInactive=true` lists both
 * (R-SRCH-2 S1); `active=true|false` narrows to one state and wins over includeInactive (R-CAT-2 S2).
 */
export const adminCatalogSearchQuery = catalogSearchQuery.extend({
  includeInactive: z.stringbool().default(false),
  active: z.stringbool().optional(),
});
export type AdminCatalogSearchQuery = z.infer<typeof adminCatalogSearchQuery>;

/** Catalog item as the API returns it. Money is a decimal string (numeric(14,2)). */
export const catalogItem = z.object({
  id: z.uuid(),
  categorySlug: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  referencePriceMc: mcAmount.nullable(),
  imageKey: z.string().nullable(),
  source: z.enum(CATALOG_SOURCE),
});
export type CatalogItem = z.infer<typeof catalogItem>;

/** Offset page of catalog items (search and admin list). */
export const catalogItemPage = z.object({
  items: z.array(catalogItem),
  total: z.number().int().min(0),
  limit: z.number().int(),
  offset: z.number().int(),
  hasMore: z.boolean(),
});
export type CatalogItemPage = z.infer<typeof catalogItemPage>;

/** Category as the API returns it. */
export const itemCategory = z.object({
  slug: z.string(),
  name: z.string(),
  icon: z.string(),
  sortOrder: z.number().int(),
});
export type ItemCategory = z.infer<typeof itemCategory>;
