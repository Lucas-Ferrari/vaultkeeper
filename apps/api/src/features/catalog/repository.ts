import { CATALOG_SOURCE } from "@vaultkeeper/shared/constants";
import type {
  CatalogItem,
  CreateCatalogItemInput,
  CreateCategoryInput,
  ItemCategory,
  UpdateCatalogItemInput,
  UpdateCategoryInput,
} from "@vaultkeeper/shared/schemas/catalog";
import { and, asc, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import { catalogItems, itemCategories } from "../../db/schema";

/** Columns of the CatalogItem DTO (one place, so every query returns the same shape). */
const itemColumns = {
  id: catalogItems.id,
  categorySlug: catalogItems.categorySlug,
  name: catalogItems.name,
  isActive: catalogItems.isActive,
  referencePriceMc: catalogItems.referencePriceMc,
  imageKey: catalogItems.imageKey,
  source: catalogItems.source,
};

export interface CatalogItemFilter {
  /** true/false narrows to one state; undefined lists both (admin). */
  active: boolean | undefined;
  category: string | undefined;
  limit: number;
  offset: number;
}

export interface CatalogItemRows {
  items: CatalogItem[];
  total: number;
}

/**
 * pg_trgm word-similarity cut-off (ADR6, design 07), applied per transaction with
 * set_config(..., true) so it never leaks to other pooled connections.
 * Tuned in task 3.6: 0.3. One-letter typos of short words score ~0.33 ("wigns"/"strom" vs
 * "wings"/"storm"), so anything above 0.33 drops S3; the noise at that level ("storm" vs "staff",
 * 0.33) is pushed down by the ranking instead of being filtered out.
 */
export const WORD_SIMILARITY_THRESHOLD = 0.3;

/** Escapes LIKE metacharacters so user input matches literally (Postgres default ESCAPE '\'). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Case- and accent-folded input, exactly like the generated `search_name` column. */
function folded(value: string): SQL {
  return sql`public.immutable_unaccent(lower(${value}))`;
}

function filterConditions(filter: CatalogItemFilter): SQL | undefined {
  return and(
    filter.active === undefined ? undefined : eq(catalogItems.isActive, filter.active),
    filter.category === undefined ? undefined : eq(catalogItems.categorySlug, filter.category),
  );
}

export async function insertItem(db: DbOrTx, input: CreateCatalogItemInput): Promise<CatalogItem> {
  const [row] = await db
    .insert(catalogItems)
    .values({
      categorySlug: input.categorySlug,
      name: input.name,
      source: CATALOG_SOURCE.ADMIN,
      referencePriceMc: input.referencePriceMc ?? null,
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    })
    .returning(itemColumns);
  if (!row) throw new Error("insert into catalog_items returned no row");
  return row;
}

export async function updateItem(
  db: DbOrTx,
  id: string,
  patch: UpdateCatalogItemInput,
): Promise<CatalogItem | null> {
  const [row] = await db
    .update(catalogItems)
    .set(patch)
    .where(eq(catalogItems.id, id))
    .returning(itemColumns);
  return row ?? null;
}

export interface CatalogBrowseFilter extends CatalogItemFilter {
  /** Optional name prefix (short queries, R-SRCH-1 S7). */
  prefix: string | undefined;
}

/** Browse: filters (+ optional name prefix), ordered by name. Fuzzy search is `searchItems`. */
export async function listItems(db: DbOrTx, filter: CatalogBrowseFilter): Promise<CatalogItemRows> {
  const where = and(
    filterConditions(filter),
    filter.prefix
      ? sql`${catalogItems.searchName} LIKE ${folded(escapeLike(filter.prefix))} || '%'`
      : undefined,
  );
  const items = await db
    .select(itemColumns)
    .from(catalogItems)
    .where(where)
    .orderBy(asc(catalogItems.name), asc(catalogItems.id))
    .limit(filter.limit)
    .offset(filter.offset);
  const [totals] = await db.select({ total: count() }).from(catalogItems).where(where);
  return { items, total: totals?.total ?? 0 };
}

export async function findItem(
  db: DbOrTx,
  id: string,
  options: { activeOnly: boolean },
): Promise<CatalogItem | null> {
  const [row] = await db
    .select(itemColumns)
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.id, id),
        options.activeOnly ? eq(catalogItems.isActive, true) : undefined,
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Hard delete. Stock entries reference items ON DELETE RESTRICT, so a used item fails (23503). */
export async function deleteItem(db: DbOrTx, id: string): Promise<boolean> {
  const rows = await db
    .delete(catalogItems)
    .where(eq(catalogItems.id, id))
    .returning({ id: catalogItems.id });
  return rows.length > 0;
}

export interface CatalogSearchFilter extends CatalogItemFilter {
  q: string;
}

/**
 * Query words shorter than this carry no trigram signal ("of", "de" are in half the catalog), so
 * they never make a row match on their own; the whole query still scores them.
 */
export const MIN_TOKEN_LENGTH = 3;

/**
 * Fuzzy search (R-SRCH-1, design 07 tuned by task 3.6), served by the GIN trigram index:
 * - match: any query word (>= MIN_TOKEN_LENGTH) word-similar to the name (`%>`, threshold above),
 *   OR the whole query as a substring (covers 2-char queries and exact fragments);
 * - rank: exact folded name first (S5), then score = max(whole-query word_similarity, mean of the
 *   per-word word_similarity) so multi-typo queries ("excelent wigs", S9) still rank the words that
 *   do match, then name.
 * Whole-query `<%` alone (design 07) missed S9: "excelent wigs" scores 0.2 vs every wing.
 * Index use (task 3.7): `%> ANY(...)` is GIN-servable (bitmap scan), but at 10k rows Postgres
 * prefers a seq scan because pg_trgm costs GIN scans high; the perf suite asserts the shape stays
 * index-capable and logs the chosen plan.
 */
function queryWords(query: SQL): SQL {
  return sql`ARRAY(SELECT word FROM regexp_split_to_table(${query}, ${"\\s+"}) AS word WHERE char_length(word) >= ${MIN_TOKEN_LENGTH})`;
}

function searchWhere(filter: CatalogSearchFilter): SQL | undefined {
  const name = catalogItems.searchName;
  return and(
    filterConditions(filter),
    or(
      sql`${name} %> ANY(${queryWords(folded(filter.q))})`,
      sql`${name} LIKE '%' || ${folded(escapeLike(filter.q))} || '%'`,
    ),
  );
}

/**
 * The page query of `searchItems`, without the threshold set-up. Exported so the perf suite can
 * EXPLAIN exactly what runs (task 3.7); run it only inside a transaction that set the threshold.
 */
export function searchSelect(db: DbOrTx, filter: CatalogSearchFilter) {
  const query = folded(filter.q);
  const name = catalogItems.searchName;
  const score = sql<number>`GREATEST(
    word_similarity(${query}, ${name}),
    COALESCE((SELECT avg(word_similarity(word, ${name})) FROM unnest(${queryWords(query)}) AS word), 0)
  )`;
  return (
    db
      // The total rides along as a window count: one scan instead of re-running the fuzzy
      // predicate in a second COUNT query (task 3.7 halved the 10k p95 this way).
      .select({ ...itemColumns, total: sql<number>`count(*) OVER ()`.mapWith(Number) })
      .from(catalogItems)
      .where(searchWhere(filter))
      .orderBy(
        sql`(${name} = ${query}) DESC`,
        desc(score),
        asc(catalogItems.name),
        asc(catalogItems.id),
      )
      .limit(filter.limit)
      .offset(filter.offset)
  );
}

export async function searchItems(
  db: DbOrTx,
  filter: CatalogSearchFilter,
): Promise<CatalogItemRows> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('pg_trgm.word_similarity_threshold', ${String(WORD_SIMILARITY_THRESHOLD)}, true)`,
    );
    const rows = await searchSelect(tx, filter);
    const items = rows.map(({ total: _total, ...item }) => item);
    if (rows[0]) return { items, total: rows[0].total };
    // An empty page has no row to carry the window count: count only when paging past the end.
    if (filter.offset === 0) return { items, total: 0 };
    const [totals] = await tx
      .select({ total: count() })
      .from(catalogItems)
      .where(searchWhere(filter));
    return { items, total: totals?.total ?? 0 };
  });
}

const categoryColumns = {
  slug: itemCategories.slug,
  name: itemCategories.name,
  icon: itemCategories.icon,
  sortOrder: itemCategories.sortOrder,
};

export async function insertCategory(
  db: DbOrTx,
  input: CreateCategoryInput,
): Promise<ItemCategory> {
  const [row] = await db.insert(itemCategories).values(input).returning(categoryColumns);
  if (!row) throw new Error("insert into item_categories returned no row");
  return row;
}

export async function updateCategory(
  db: DbOrTx,
  slug: string,
  patch: UpdateCategoryInput,
): Promise<ItemCategory | null> {
  const [row] = await db
    .update(itemCategories)
    .set(patch)
    .where(eq(itemCategories.slug, slug))
    .returning(categoryColumns);
  return row ?? null;
}

/** Display order: sort_order, then name (design 04). */
export function listCategories(db: DbOrTx): Promise<ItemCategory[]> {
  return db
    .select(categoryColumns)
    .from(itemCategories)
    .orderBy(asc(itemCategories.sortOrder), asc(itemCategories.name));
}
