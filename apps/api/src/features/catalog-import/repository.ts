import { CATALOG_SOURCE } from "@vaultkeeper/shared/constants";
import { inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import { catalogItems, itemCategories } from "../../db/schema";

export type ExistingItem = {
  id: string;
  categorySlug: string;
  searchName: string;
  name: string;
  referencePriceMc: string | null;
  isActive: boolean;
  externalKey: string | null;
};

export async function listCategorySlugs(db: DbOrTx): Promise<Set<string>> {
  const rows = await db.select({ slug: itemCategories.slug }).from(itemCategories);
  return new Set(rows.map((row) => row.slug));
}

/** Names folded by the SAME SQL as the generated search_name column (no JS/SQL drift). */
export async function foldNames(db: DbOrTx, names: readonly string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const values = sql.join(
    names.map((name, index) => sql`(${index}::int, ${name}::text)`),
    sql`, `,
  );
  const result = await db.execute<{ folded: string }>(
    sql`SELECT public.immutable_unaccent(lower(v.name)) AS folded
        FROM (VALUES ${values}) AS v(ord, name) ORDER BY v.ord`,
  );
  return result.rows.map((row) => row.folded);
}

const existingColumns = sql`c.id, c.category_slug AS "categorySlug", c.search_name AS "searchName",
  c.name, c.reference_price_mc AS "referencePriceMc", c.is_active AS "isActive",
  c.external_key AS "externalKey"`;

/** Items matching (category, folded name) keys; row-locked when `lock` (applied imports). */
export async function findByKeys(
  db: DbOrTx,
  keys: ReadonlyArray<{ categorySlug: string; searchName: string }>,
  lock: boolean,
): Promise<ExistingItem[]> {
  if (keys.length === 0) return [];
  const values = sql.join(
    keys.map((key) => sql`(${key.categorySlug}::text, ${key.searchName}::text)`),
    sql`, `,
  );
  const result = await db.execute<ExistingItem>(
    sql`SELECT ${existingColumns} FROM catalog_items AS c
        JOIN (VALUES ${values}) AS k(slug, folded)
          ON c.category_slug = k.slug AND c.search_name = k.folded
        ${lock ? sql`FOR UPDATE OF c` : sql``}`,
  );
  return result.rows;
}

/** external_key -> item id, for the keys given. */
export async function findExternalKeyOwners(
  db: DbOrTx,
  keys: readonly string[],
): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const rows = await db
    .select({ id: catalogItems.id, externalKey: catalogItems.externalKey })
    .from(catalogItems)
    .where(inArray(catalogItems.externalKey, [...keys]));
  return new Map(rows.map((row) => [row.externalKey ?? "", row.id]));
}

export interface NewCsvItem {
  categorySlug: string;
  name: string;
  referencePriceMc: string | null;
  isActive: boolean;
  externalKey: string | null;
}

export async function insertItems(db: DbOrTx, items: readonly NewCsvItem[]): Promise<void> {
  if (items.length === 0) return;
  await db
    .insert(catalogItems)
    .values(items.map((item) => ({ ...item, source: CATALOG_SOURCE.CSV })));
}

export interface ItemUpdate {
  id: string;
  referencePriceMc: string | null;
  isActive: boolean;
  externalKey: string | null;
}

/** One UPDATE ... FROM (VALUES) for all changed rows; source is kept (design 11). */
export async function updateItems(db: DbOrTx, updates: readonly ItemUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  const values = sql.join(
    updates.map(
      (u) =>
        sql`(${u.id}::uuid, ${u.referencePriceMc}::numeric(14,2), ${u.isActive}::boolean, ${u.externalKey}::text)`,
    ),
    sql`, `,
  );
  await db.execute(
    sql`UPDATE catalog_items AS c
        SET reference_price_mc = u.price, is_active = u.active, external_key = u.ext,
            updated_at = now()
        FROM (VALUES ${values}) AS u(id, price, active, ext)
        WHERE c.id = u.id`,
  );
}
