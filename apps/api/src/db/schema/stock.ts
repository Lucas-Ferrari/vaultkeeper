import { LEVEL, QUANTITY, TEXT_LIMIT } from "@vaultkeeper/shared/constants";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { catalogItems } from "./catalog";
import { between, maxLength, timestamps, uuidPk } from "./columns";
import { storageLocations } from "./game-accounts";

/**
 * What a user owns, where, and in what state (R-STK-1, design 06).
 *
 * The location FK is NO ACTION on purpose (ADR8): it is checked at the END of the statement, so
 * deleting a location/character/account that still holds stock fails (service maps it to 409
 * STORAGE_NOT_EMPTY), while deleting the USER succeeds because user_id ON DELETE CASCADE removes
 * the entries in that same statement.
 */
export const stockEntries = pgTable(
  "stock_entries",
  {
    id: uuidPk(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    storageLocationId: uuid("storage_location_id").notNull(),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "restrict" }),
    level: smallint("level").notNull().default(LEVEL.MIN),
    quantity: integer("quantity").notNull().default(QUANTITY.MIN),
    /** Manual free text (excellent options, sockets...), no structure in MVP. */
    options: text("options"),
    /** Per-entry MC override (ADR4); null inherits the catalog reference price. */
    priceMc: numeric("price_mc", { precision: 14, scale: 2, mode: "string" }),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "stock_entries_location_owner_fk",
      columns: [t.storageLocationId, t.userId],
      foreignColumns: [storageLocations.id, storageLocations.userId],
    }).onDelete("no action"),
    unique("stock_entries_id_user_unique").on(t.id, t.userId),
    index("stock_entries_user_location_idx").on(t.userId, t.storageLocationId),
    index("stock_entries_user_item_idx").on(t.userId, t.catalogItemId),
    // Keyset pagination: newest first, id as tie-breaker.
    index("stock_entries_user_created_idx").on(t.userId, t.createdAt.desc(), t.id),
    check("stock_entries_level_range", between(t.level, LEVEL.MIN, LEVEL.MAX)),
    check("stock_entries_quantity_range", between(t.quantity, QUANTITY.MIN, QUANTITY.MAX)),
    check("stock_entries_options_length", maxLength(t.options, TEXT_LIMIT.ENTRY_OPTIONS)),
    check("stock_entries_notes_length", maxLength(t.notes, TEXT_LIMIT.ENTRY_NOTES)),
    check("stock_entries_price_non_negative", sql`${t.priceMc} IS NULL OR ${t.priceMc} >= 0`),
  ],
);
