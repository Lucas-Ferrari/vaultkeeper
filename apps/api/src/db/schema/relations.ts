import { relations } from "drizzle-orm";
import { catalogItems, itemCategories } from "./catalog";
import { characters, gameAccounts, storageLocations } from "./game-accounts";
import { stockGroupEntries, stockGroups } from "./groups";
import { stockEntries } from "./stock";

/**
 * Drizzle relational-query metadata for the app tables (design 06). Kept in one file so schema
 * modules do not import each other in cycles. `user` relations stay in the generated auth.ts;
 * repositories always filter by user_id explicitly instead of walking from `user`.
 * Composite ownership FKs are mapped on their id column (user_id equality is guaranteed by the FK).
 */

export const itemCategoriesRelations = relations(itemCategories, ({ many }) => ({
  items: many(catalogItems),
}));

export const catalogItemsRelations = relations(catalogItems, ({ one, many }) => ({
  category: one(itemCategories, {
    fields: [catalogItems.categorySlug],
    references: [itemCategories.slug],
  }),
  stockEntries: many(stockEntries),
}));

export const gameAccountsRelations = relations(gameAccounts, ({ many }) => ({
  characters: many(characters),
  storageLocations: many(storageLocations),
}));

export const charactersRelations = relations(characters, ({ one }) => ({
  gameAccount: one(gameAccounts, {
    fields: [characters.gameAccountId],
    references: [gameAccounts.id],
  }),
  inventory: one(storageLocations),
}));

export const storageLocationsRelations = relations(storageLocations, ({ one, many }) => ({
  gameAccount: one(gameAccounts, {
    fields: [storageLocations.gameAccountId],
    references: [gameAccounts.id],
  }),
  character: one(characters, {
    fields: [storageLocations.characterId],
    references: [characters.id],
  }),
  stockEntries: many(stockEntries),
}));

export const stockEntriesRelations = relations(stockEntries, ({ one, many }) => ({
  storageLocation: one(storageLocations, {
    fields: [stockEntries.storageLocationId],
    references: [storageLocations.id],
  }),
  catalogItem: one(catalogItems, {
    fields: [stockEntries.catalogItemId],
    references: [catalogItems.id],
  }),
  groupMemberships: many(stockGroupEntries),
}));

export const stockGroupsRelations = relations(stockGroups, ({ many }) => ({
  entries: many(stockGroupEntries),
}));

export const stockGroupEntriesRelations = relations(stockGroupEntries, ({ one }) => ({
  group: one(stockGroups, {
    fields: [stockGroupEntries.groupId],
    references: [stockGroups.id],
  }),
  stockEntry: one(stockEntries, {
    fields: [stockGroupEntries.stockEntryId],
    references: [stockEntries.id],
  }),
}));
