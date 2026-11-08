import { TEXT_LIMIT } from "@vaultkeeper/shared/constants";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { lengthBetween, maxLength, timestamps, uuidPk } from "./columns";
import { stockEntries } from "./stock";

/** User-defined collections of their own stock entries (R-GRP-1, design 06). */
export const stockGroups = pgTable(
  "stock_groups",
  {
    id: uuidPk(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("stock_groups_user_name_unique").on(t.userId, sql`lower(${t.name})`),
    unique("stock_groups_id_user_unique").on(t.id, t.userId),
    check("stock_groups_name_length", lengthBetween(t.name, 1, TEXT_LIMIT.GROUP_NAME)),
    check(
      "stock_groups_description_length",
      maxLength(t.description, TEXT_LIMIT.GROUP_DESCRIPTION),
    ),
  ],
);

/**
 * Many-to-many membership (R-GRP-2). Both FKs carry user_id, so group and entry must belong to the
 * row's user: cross-user membership is impossible at the DB level (ADR2, R-AUTH-5 S3). Deleting an
 * entry or a group removes its memberships, never the other side.
 */
export const stockGroupEntries = pgTable(
  "stock_group_entries",
  {
    groupId: uuid("group_id").notNull(),
    stockEntryId: uuid("stock_entry_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [
    primaryKey({ name: "stock_group_entries_pk", columns: [t.groupId, t.stockEntryId] }),
    foreignKey({
      name: "stock_group_entries_group_owner_fk",
      columns: [t.groupId, t.userId],
      foreignColumns: [stockGroups.id, stockGroups.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "stock_group_entries_entry_owner_fk",
      columns: [t.stockEntryId, t.userId],
      foreignColumns: [stockEntries.id, stockEntries.userId],
    }).onDelete("cascade"),
    index("stock_group_entries_entry_idx").on(t.stockEntryId),
  ],
);
