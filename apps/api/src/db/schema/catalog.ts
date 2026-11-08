import { CATALOG_SOURCE, CATEGORY_SLUG_PATTERN, TEXT_LIMIT } from "@vaultkeeper/shared/constants";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { inList, lengthBetween, literal, objectValues, timestamps, uuidPk } from "./columns";

/** Catalog categories (design 04): slug PK, admin-curated display data. */
export const itemCategories = pgTable(
  "item_categories",
  {
    slug: text("slug").primaryKey(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Placeholder icon key resolved by the web app. */
    icon: text("icon").notNull(),
  },
  (t) => [
    check("item_categories_slug_format", sql`${t.slug} ~ ${literal(CATEGORY_SLUG_PATTERN.source)}`),
  ],
);

/**
 * One global catalog (R-CAT-1). `search_name` is the case- and accent-folded name: it backs both
 * the per-category uniqueness and the trigram search (ADR6).
 */
export const catalogItems = pgTable(
  "catalog_items",
  {
    id: uuidPk(),
    /** Stable import key (e.g. `openmu:s6:0:0`); CSV rows may set it. */
    externalKey: text("external_key").unique(),
    categorySlug: text("category_slug")
      .notNull()
      .references(() => itemCategories.slug, { onUpdate: "cascade" }),
    name: text("name").notNull(),
    searchName: text("search_name")
      .notNull()
      .generatedAlwaysAs(sql`public.immutable_unaccent(lower(name))`),
    source: text("source", { enum: objectValues(CATALOG_SOURCE) }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    /** Exact MC (ADR3): numeric(14,2) read as a decimal string. */
    referencePriceMc: numeric("reference_price_mc", { precision: 14, scale: 2, mode: "string" }),
    imageKey: text("image_key"),
    ...timestamps(),
  },
  (t) => [
    unique("catalog_items_category_search_name_unique").on(t.categorySlug, t.searchName),
    index("catalog_items_search_name_trgm_idx").using("gin", t.searchName.op("gin_trgm_ops")),
    index("catalog_items_category_active_idx").on(t.categorySlug, t.isActive),
    check("catalog_items_name_length", lengthBetween(t.name, 1, TEXT_LIMIT.CATALOG_ITEM_NAME)),
    check("catalog_items_source_valid", inList(t.source, objectValues(CATALOG_SOURCE))),
    check(
      "catalog_items_reference_price_non_negative",
      sql`${t.referencePriceMc} IS NULL OR ${t.referencePriceMc} >= 0`,
    ),
  ],
);
