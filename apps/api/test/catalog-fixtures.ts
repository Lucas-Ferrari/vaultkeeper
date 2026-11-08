import type { Pool } from "pg";

export interface CategoryRow {
  slug: string;
  name: string;
  icon: string;
  sortOrder?: number;
}

/** Inserts categories directly (category routes are tested on their own). */
export async function insertCategories(pool: Pool, rows: readonly CategoryRow[]): Promise<void> {
  for (const row of rows) {
    await pool.query(
      "INSERT INTO item_categories (slug, name, icon, sort_order) VALUES ($1, $2, $3, $4)",
      [row.slug, row.name, row.icon, row.sortOrder ?? 0],
    );
  }
}

export interface ItemRow {
  categorySlug: string;
  name: string;
  isActive?: boolean;
  referencePriceMc?: string | null;
}

/** Inserts catalog items directly and returns their ids in input order. */
export async function insertItems(pool: Pool, rows: readonly ItemRow[]): Promise<string[]> {
  const ids: string[] = [];
  for (const row of rows) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO catalog_items (category_slug, name, source, is_active, reference_price_mc)
       VALUES ($1, $2, 'admin', $3, $4) RETURNING id`,
      [row.categorySlug, row.name, row.isActive ?? true, row.referencePriceMc ?? null],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("insert returned no id");
    ids.push(id);
  }
  return ids;
}

/** Search fixture (R-SRCH-1/2): MU-like names with near-duplicates, accents and distractors. */
export const SEARCH_CATEGORIES: readonly CategoryRow[] = [
  { slug: "wings", name: "Wings", icon: "wings" },
  { slug: "swords", name: "Swords", icon: "sword" },
  { slug: "staffs", name: "Staffs", icon: "staff" },
  { slug: "armors", name: "Armors", icon: "armor" },
  { slug: "helms", name: "Helms", icon: "helm" },
];

const WINGS = [
  "Wings of Storm",
  "Wings of Eternal",
  "Wings of Illusion",
  "Wings of Despair",
  "Wings of Heaven",
  "Wings of Satan",
  "Wings of Elf",
  "Wings of Spirits",
  "Wings of Dragon",
  "Wings of Soul",
  "Cape of Lord",
];

export const SEARCH_ITEMS: readonly ItemRow[] = [
  ...WINGS.map((name) => ({ categorySlug: "wings", name })),
  { categorySlug: "swords", name: "Sword of Destruction" },
  { categorySlug: "staffs", name: "Destruction" },
  // Sorts before "Destruction" by name: the exact match must win on relevance, not alphabet (S5).
  { categorySlug: "swords", name: "Axe of Destruction" },
  { categorySlug: "armors", name: "Storm Crow Armor" },
  { categorySlug: "helms", name: "Storm Crow Helm" },
  { categorySlug: "swords", name: "Espada Ígnea" },
  { categorySlug: "swords", name: "Excalibur" },
  { categorySlug: "staffs", name: "Exalted Staff" },
  { categorySlug: "staffs", name: "Wizard Staff" },
  { categorySlug: "staffs", name: "Legendary Staff" },
  { categorySlug: "swords", name: "Thunder Blade" },
  { categorySlug: "swords", name: "Kris" },
  { categorySlug: "armors", name: "Dark Phoenix Armor" },
  { categorySlug: "wings", name: "Wings of Storm Inactive", isActive: false },
];

/**
 * A stock entry referencing `catalogItemId`, owned by a fresh bare user with one account and one
 * vault (stock routes land in phase 4; this is enough to make the item "referenced").
 */
export async function insertStockEntryFor(pool: Pool, catalogItemId: string): Promise<string> {
  const client = await pool.connect();
  try {
    const userId = crypto.randomUUID();
    await client.query(`INSERT INTO "user" (id, name, email) VALUES ($1, 'Owner', $2)`, [
      userId,
      `${userId}@test.local`,
    ]);
    const account = await client.query<{ id: string }>(
      "INSERT INTO game_accounts (user_id, name) VALUES ($1, 'Main') RETURNING id",
      [userId],
    );
    const accountId = account.rows[0]?.id;
    const vault = await client.query<{ id: string }>(
      `INSERT INTO storage_locations (user_id, game_account_id, kind, vault_number)
       VALUES ($1, $2, 'vault', 1) RETURNING id`,
      [userId, accountId],
    );
    const entry = await client.query<{ id: string }>(
      `INSERT INTO stock_entries (user_id, storage_location_id, catalog_item_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [userId, vault.rows[0]?.id, catalogItemId],
    );
    const id = entry.rows[0]?.id;
    if (!id) throw new Error("stock insert returned no id");
    return id;
  } finally {
    client.release();
  }
}
