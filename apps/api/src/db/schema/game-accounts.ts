import { STORAGE_KIND, TEXT_LIMIT, VAULT_COUNT } from "@vaultkeeper/shared/constants";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import {
  between,
  inList,
  lengthBetween,
  literal,
  objectValues,
  timestamps,
  uuidPk,
} from "./columns";

/**
 * Ownership is enforced by COMPOSITE foreign keys that carry user_id (ADR2, design 05): a child row
 * can only reference a parent with the same owner, so cross-user links are impossible in the DB.
 * Every parent therefore exposes UNIQUE (id, user_id) (or (id, game_account_id)) as FK target.
 */

/** R-GA-1: a user's game accounts; name unique per user, case-insensitive. */
export const gameAccounts = pgTable(
  "game_accounts",
  {
    id: uuidPk(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("game_accounts_user_name_unique").on(t.userId, sql`lower(${t.name})`),
    unique("game_accounts_id_user_unique").on(t.id, t.userId),
    check("game_accounts_name_length", lengthBetween(t.name, 1, TEXT_LIMIT.GAME_ACCOUNT_NAME)),
  ],
);

/** R-GA-3: characters of an account; name unique per account, case-insensitive. */
export const characters = pgTable(
  "characters",
  {
    id: uuidPk(),
    gameAccountId: uuid("game_account_id").notNull(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    class: text("class"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "characters_account_owner_fk",
      columns: [t.gameAccountId, t.userId],
      foreignColumns: [gameAccounts.id, gameAccounts.userId],
    }).onDelete("cascade"),
    uniqueIndex("characters_account_name_unique").on(t.gameAccountId, sql`lower(${t.name})`),
    unique("characters_id_account_unique").on(t.id, t.gameAccountId),
    check("characters_name_length", lengthBetween(t.name, 1, TEXT_LIMIT.CHARACTER_NAME)),
  ],
);

/**
 * Where stock lives: one inventory per character, vaults 1..N per account (R-GA-2/3). Rows are
 * created by the services (account/character lifecycle, vault_count reconciliation), never by users.
 */
export const storageLocations = pgTable(
  "storage_locations",
  {
    id: uuidPk(),
    userId: text("user_id").notNull(),
    gameAccountId: uuid("game_account_id").notNull(),
    kind: text("kind", { enum: objectValues(STORAGE_KIND) }).notNull(),
    characterId: uuid("character_id"),
    vaultNumber: smallint("vault_number"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "storage_locations_account_owner_fk",
      columns: [t.gameAccountId, t.userId],
      foreignColumns: [gameAccounts.id, gameAccounts.userId],
    }).onDelete("cascade"),
    // The character must belong to the SAME account (and therefore the same user).
    foreignKey({
      name: "storage_locations_character_account_fk",
      columns: [t.characterId, t.gameAccountId],
      foreignColumns: [characters.id, characters.gameAccountId],
    }).onDelete("cascade"),
    check("storage_locations_kind_valid", inList(t.kind, objectValues(STORAGE_KIND))),
    // NOT NULL is explicit: `NULL BETWEEN 1 AND 50` is NULL, which a CHECK lets through.
    check(
      "storage_locations_kind_shape",
      sql`(${t.kind} = ${literal(STORAGE_KIND.INVENTORY)} AND ${t.characterId} IS NOT NULL AND ${t.vaultNumber} IS NULL)
        OR (${t.kind} = ${literal(STORAGE_KIND.VAULT)} AND ${t.characterId} IS NULL AND ${t.vaultNumber} IS NOT NULL AND ${between(t.vaultNumber, VAULT_COUNT.MIN, VAULT_COUNT.MAX)})`,
    ),
    uniqueIndex("storage_locations_vault_number_unique")
      .on(t.gameAccountId, t.vaultNumber)
      .where(sql`${t.kind} = ${literal(STORAGE_KIND.VAULT)}`),
    uniqueIndex("storage_locations_inventory_unique")
      .on(t.characterId)
      .where(sql`${t.kind} = ${literal(STORAGE_KIND.INVENTORY)}`),
    unique("storage_locations_id_user_unique").on(t.id, t.userId),
  ],
);
