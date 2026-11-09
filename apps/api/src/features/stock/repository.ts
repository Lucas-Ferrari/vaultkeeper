import type {
  CreateStockEntryInput,
  StockEntry,
  UpdateStockEntryInput,
} from "@vaultkeeper/shared/schemas/stock";
import { and, desc, eq, exists, inArray, notExists, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import {
  catalogItems,
  characters,
  stockEntries,
  stockGroupEntries,
  storageLocations,
} from "../../db/schema";
import { fuzzyNameMatch, withSearchThreshold } from "../catalog/repository";
import { isOverLimit, locationLabel } from "../game-accounts/location-sql";
import { lineValueMc, unitPriceMc } from "./line-value";

/** Every query is scoped by user_id (R-AUTH-5): other users' rows are "not found". */

export interface WritableLocation {
  id: string;
  overLimit: boolean;
}

/** A location of this user, with its over-limit flag (R-GA-5 S3), or null. */
export async function findOwnLocation(
  db: DbOrTx,
  userId: string,
  id: string,
): Promise<WritableLocation | null> {
  const [row] = await db
    .select({ id: storageLocations.id, overLimit: isOverLimit })
    .from(storageLocations)
    .where(and(eq(storageLocations.id, id), eq(storageLocations.userId, userId)));
  return row ?? null;
}

/** Item activity (R-CAT-3 S2), or null when the item does not exist. */
export async function findItemState(db: DbOrTx, id: string): Promise<{ isActive: boolean } | null> {
  const [row] = await db
    .select({ isActive: catalogItems.isActive })
    .from(catalogItems)
    .where(eq(catalogItems.id, id));
  return row ?? null;
}

const rowColumns = {
  id: stockEntries.id,
  catalogItemId: stockEntries.catalogItemId,
  itemName: catalogItems.name,
  itemActive: catalogItems.isActive,
  categorySlug: catalogItems.categorySlug,
  imageKey: catalogItems.imageKey,
  level: stockEntries.level,
  quantity: stockEntries.quantity,
  options: stockEntries.options,
  notes: stockEntries.notes,
  priceMc: stockEntries.priceMc,
  unitPriceMc,
  valueMc: lineValueMc,
  storageLocationId: stockEntries.storageLocationId,
  gameAccountId: storageLocations.gameAccountId,
  locationLabel,
  createdAt: stockEntries.createdAt,
  /** Exact (microsecond) timestamp text for the keyset cursor; JS Dates only keep ms. */
  cursorAt: sql<string>`${stockEntries.createdAt}::text`,
};

function selectRows(db: DbOrTx, where: SQL | undefined) {
  return db
    .select(rowColumns)
    .from(stockEntries)
    .innerJoin(catalogItems, eq(catalogItems.id, stockEntries.catalogItemId))
    .innerJoin(storageLocations, eq(storageLocations.id, stockEntries.storageLocationId))
    .leftJoin(characters, eq(characters.id, storageLocations.characterId))
    .where(where);
}

type Row = Awaited<ReturnType<typeof selectRows>>[number];

export interface StockRow {
  entry: StockEntry;
  cursorAt: string;
}

function toRow({ cursorAt, createdAt, ...rest }: Row): StockRow {
  return { entry: { ...rest, createdAt: createdAt.toISOString() }, cursorAt };
}

const ownEntry = (userId: string, id: string) =>
  and(eq(stockEntries.id, id), eq(stockEntries.userId, userId));

export async function findEntry(
  db: DbOrTx,
  userId: string,
  id: string,
): Promise<StockEntry | null> {
  const [row] = await selectRows(db, ownEntry(userId, id));
  return row ? toRow(row).entry : null;
}

/** Entry's current item and location (PATCH item check, over-limit cleanup). Row-locked. */
export async function findEntryItem(
  db: DbOrTx,
  userId: string,
  id: string,
): Promise<{ catalogItemId: string; storageLocationId: string } | null> {
  const [row] = await db
    .select({
      catalogItemId: stockEntries.catalogItemId,
      storageLocationId: stockEntries.storageLocationId,
    })
    .from(stockEntries)
    .where(ownEntry(userId, id))
    .for("update");
  return row ?? null;
}

/**
 * R-GA-5: an over-limit vault is removed as soon as it is emptied. Within-limit vaults and
 * inventories are never touched; a vault that still holds stock is kept.
 */
export async function deleteVaultIfEmptyOverLimit(
  db: DbOrTx,
  userId: string,
  locationId: string,
): Promise<void> {
  await db.delete(storageLocations).where(
    and(
      eq(storageLocations.id, locationId),
      eq(storageLocations.userId, userId),
      isOverLimit,
      notExists(
        db
          .select({ one: sql`1` })
          .from(stockEntries)
          .where(eq(stockEntries.storageLocationId, storageLocations.id)),
      ),
    ),
  );
}

export async function insertEntry(
  db: DbOrTx,
  userId: string,
  input: CreateStockEntryInput,
): Promise<string> {
  const [row] = await db
    .insert(stockEntries)
    .values({
      userId,
      storageLocationId: input.storageLocationId,
      catalogItemId: input.catalogItemId,
      level: input.level,
      quantity: input.quantity,
      options: input.options ?? null,
      priceMc: input.priceMc ?? null,
      notes: input.notes ?? null,
    })
    .returning({ id: stockEntries.id });
  if (!row) throw new Error("insert into stock_entries returned no row");
  return row.id;
}

export async function updateEntry(
  db: DbOrTx,
  userId: string,
  id: string,
  patch: UpdateStockEntryInput | { storageLocationId: string },
): Promise<boolean> {
  const rows = await db
    .update(stockEntries)
    .set(patch)
    .where(ownEntry(userId, id))
    .returning({ id: stockEntries.id });
  return rows.length > 0;
}

/** Deletes the entry; its group memberships cascade, the groups stay (R-STK-3 S1). */
export async function deleteEntry(db: DbOrTx, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(stockEntries)
    .where(ownEntry(userId, id))
    .returning({ id: stockEntries.id });
  return rows.length > 0;
}

/** All members of a group with their current location (R-GRP-3), newest first. */
export async function listGroupEntries(
  db: DbOrTx,
  userId: string,
  groupId: string,
): Promise<StockEntry[]> {
  const rows = await selectRows(
    db,
    and(
      eq(stockEntries.userId, userId),
      exists(
        db
          .select({ one: sql`1` })
          .from(stockGroupEntries)
          .where(
            and(
              eq(stockGroupEntries.stockEntryId, stockEntries.id),
              eq(stockGroupEntries.groupId, groupId),
            ),
          ),
      ),
    ),
  ).orderBy(desc(stockEntries.createdAt), desc(stockEntries.id));
  return rows.map((row) => toRow(row).entry);
}

/** How many of `ids` (distinct) are this user's entries. */
export async function countOwnEntries(
  db: DbOrTx,
  userId: string,
  ids: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(stockEntries)
    .where(and(eq(stockEntries.userId, userId), inArray(stockEntries.id, [...ids])));
  return row?.n ?? 0;
}

export interface StockFilter {
  accountId?: string | undefined;
  characterId?: string | undefined;
  locationId?: string | undefined;
  groupId?: string | undefined;
  category?: string | undefined;
  q?: string | undefined;
  /** Keyset position: rows strictly after (created_at, id) in DESC order. */
  after?: { at: string; id: string } | undefined;
  limit: number;
}

function listWhere(db: DbOrTx, userId: string, filter: StockFilter): SQL | undefined {
  return and(
    eq(stockEntries.userId, userId),
    filter.accountId === undefined
      ? undefined
      : eq(storageLocations.gameAccountId, filter.accountId),
    filter.characterId === undefined
      ? undefined
      : eq(storageLocations.characterId, filter.characterId),
    filter.locationId === undefined
      ? undefined
      : eq(stockEntries.storageLocationId, filter.locationId),
    filter.category === undefined ? undefined : eq(catalogItems.categorySlug, filter.category),
    filter.groupId === undefined
      ? undefined
      : exists(
          db
            .select({ one: sql`1` })
            .from(stockGroupEntries)
            .where(
              and(
                eq(stockGroupEntries.stockEntryId, stockEntries.id),
                eq(stockGroupEntries.groupId, filter.groupId),
                eq(stockGroupEntries.userId, userId),
              ),
            ),
        ),
    filter.q ? fuzzyNameMatch(filter.q) : undefined,
    filter.after === undefined
      ? undefined
      : sql`(${stockEntries.createdAt}, ${stockEntries.id}) < (${filter.after.at}::timestamptz, ${filter.after.id}::uuid)`,
  );
}

/** Newest first, id as tie-breaker (index stock_entries_user_created_idx). limit+1 rows max. */
export function listEntries(db: DbOrTx, userId: string, filter: StockFilter): Promise<StockRow[]> {
  return withSearchThreshold(db, async (tx) => {
    const rows = await selectRows(tx, listWhere(tx, userId, filter))
      .orderBy(desc(stockEntries.createdAt), desc(stockEntries.id))
      .limit(filter.limit + 1);
    return rows.map(toRow);
  });
}
