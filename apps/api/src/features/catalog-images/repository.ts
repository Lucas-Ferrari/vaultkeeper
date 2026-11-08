import type { CatalogItem } from "@vaultkeeper/shared/schemas/catalog";
import { count, eq } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import { catalogItems } from "../../db/schema";
import type { StorageAdapter } from "../../storage/storage-adapter";

const itemColumns = {
  id: catalogItems.id,
  categorySlug: catalogItems.categorySlug,
  name: catalogItems.name,
  isActive: catalogItems.isActive,
  referencePriceMc: catalogItems.referencePriceMc,
  imageKey: catalogItems.imageKey,
  source: catalogItems.source,
};

export interface ImageKeyRow {
  imageKey: string | null;
}

/** Whether the item exists (any state: admins manage inactive items too). */
export async function itemExists(db: DbOrTx, id: string): Promise<boolean> {
  const rows = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1);
  return rows.length > 0;
}

/** Current image key, row-locked until the transaction ends; null when the item is missing. */
export async function lockImageKey(db: DbOrTx, id: string): Promise<ImageKeyRow | null> {
  const [row] = await db
    .select({ imageKey: catalogItems.imageKey })
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .for("update");
  return row ?? null;
}

export async function setImageKey(
  db: DbOrTx,
  id: string,
  imageKey: string | null,
): Promise<CatalogItem | null> {
  const [row] = await db
    .update(catalogItems)
    .set({ imageKey })
    .where(eq(catalogItems.id, id))
    .returning(itemColumns);
  return row ?? null;
}

/** How many items reference `imageKey` (content-addressed files can be shared). */
export async function countImageKeyUses(db: DbOrTx, imageKey: string): Promise<number> {
  const [row] = await db
    .select({ uses: count() })
    .from(catalogItems)
    .where(eq(catalogItems.imageKey, imageKey));
  return row?.uses ?? 0;
}

/** Deletes a stored image once no item references it any more (no orphan files). */
export async function deleteImageIfUnused(
  db: DbOrTx,
  storage: StorageAdapter,
  imageKey: string,
): Promise<void> {
  if ((await countImageKeyUses(db, imageKey)) === 0) await storage.delete(imageKey);
}
