import { z } from "zod";
import { STORAGE_KIND, TEXT_LIMIT } from "../constants";

function hasAnyField(value: object): boolean {
  return Object.keys(value).length > 0;
}

function trimmedName(max: number) {
  return z
    .string()
    .trim()
    .min(1, { error: "Enter a name" })
    .max(max, { error: `Use at most ${max} characters` });
}

/** R-GA-1: account name, trimmed, 1..50, unique per user (case-insensitive, DB index). */
export const gameAccountName = trimmedName(TEXT_LIMIT.GAME_ACCOUNT_NAME);

/** R-GA-3: character name, trimmed, 1..10 (MU limit), unique per account. */
export const characterName = trimmedName(TEXT_LIMIT.CHARACTER_NAME);

const accountNotes = z
  .string()
  .max(TEXT_LIMIT.GAME_ACCOUNT_NOTES, {
    error: `Use at most ${TEXT_LIMIT.GAME_ACCOUNT_NOTES} characters`,
  })
  .nullable();

const characterClass = z
  .string()
  .trim()
  .max(TEXT_LIMIT.CHARACTER_CLASS, {
    error: `Use at most ${TEXT_LIMIT.CHARACTER_CLASS} characters`,
  })
  .nullable();

/** POST /game-accounts. Vaults 1..vault_count are created with it (R-GA-2). */
export const createGameAccountInput = z.object({
  name: gameAccountName,
  notes: accountNotes.optional(),
});
export type CreateGameAccountInput = z.infer<typeof createGameAccountInput>;

/** PATCH /game-accounts/:id: rename and/or notes, at least one field. */
export const updateGameAccountInput = createGameAccountInput
  .partial()
  .refine(hasAnyField, { error: "Change at least one field" });
export type UpdateGameAccountInput = z.infer<typeof updateGameAccountInput>;

/** POST /game-accounts/:id/characters. Its inventory is created with it (R-GA-3 S1). */
export const createCharacterInput = z.object({
  name: characterName,
  class: characterClass.optional(),
});
export type CreateCharacterInput = z.infer<typeof createCharacterInput>;

/** PATCH /characters/:id. */
export const updateCharacterInput = createCharacterInput
  .partial()
  .refine(hasAnyField, { error: "Change at least one field" });
export type UpdateCharacterInput = z.infer<typeof updateCharacterInput>;

/** Game account as the API returns it. */
export const gameAccount = z.object({
  id: z.uuid(),
  name: z.string(),
  notes: z.string().nullable(),
});
export type GameAccount = z.infer<typeof gameAccount>;

/** Character as the API returns it. */
export const character = z.object({
  id: z.uuid(),
  gameAccountId: z.uuid(),
  name: z.string(),
  class: z.string().nullable(),
});
export type Character = z.infer<typeof character>;

/**
 * A storage location with its display label ("Inventory – DarkLord", "Vault 3"; R-GA-3 S3),
 * entry count, and overLimit = vault_number > settings.vault_count (R-GA-5).
 */
export const storageLocation = z.object({
  id: z.uuid(),
  kind: z.enum(STORAGE_KIND),
  label: z.string(),
  vaultNumber: z.number().int().nullable(),
  characterId: z.uuid().nullable(),
  characterName: z.string().nullable(),
  entryCount: z.number().int().min(0),
  overLimit: z.boolean(),
});
export type StorageLocation = z.infer<typeof storageLocation>;

/** GET /game-accounts/:id/storage: inventories (by character name), then vaults (by number). */
export const accountStorage = z.object({
  accountId: z.uuid(),
  vaultCount: z.number().int(),
  locations: z.array(storageLocation),
});
export type AccountStorage = z.infer<typeof accountStorage>;

/** Label prefixes, shared by the API's SQL and any client-side rendering. */
export const LOCATION_LABEL = {
  INVENTORY_PREFIX: "Inventory – ",
  VAULT_PREFIX: "Vault ",
} as const;
