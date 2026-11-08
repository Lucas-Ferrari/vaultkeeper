import { STORAGE_KIND } from "@vaultkeeper/shared/constants";
import type {
  Character,
  CreateCharacterInput,
  CreateGameAccountInput,
  GameAccount,
  StorageLocation,
  UpdateCharacterInput,
  UpdateGameAccountInput,
} from "@vaultkeeper/shared/schemas/game-accounts";
import { and, asc, count, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import {
  appSettings,
  characters,
  gameAccounts,
  stockEntries,
  storageLocations,
} from "../../db/schema";
import { isOverLimit, locationLabel } from "./location-sql";

/** Every query is scoped by user_id: other users' rows are simply "not found" (R-AUTH-5). */

const accountColumns = {
  id: gameAccounts.id,
  name: gameAccounts.name,
  notes: gameAccounts.notes,
};

const characterColumns = {
  id: characters.id,
  gameAccountId: characters.gameAccountId,
  name: characters.name,
  class: characters.class,
};

const ownAccount = (userId: string, id: string) =>
  and(eq(gameAccounts.id, id), eq(gameAccounts.userId, userId));
const ownCharacter = (userId: string, id: string) =>
  and(eq(characters.id, id), eq(characters.userId, userId));

export function listAccounts(db: DbOrTx, userId: string): Promise<GameAccount[]> {
  return db
    .select(accountColumns)
    .from(gameAccounts)
    .where(eq(gameAccounts.userId, userId))
    .orderBy(asc(sql`lower(${gameAccounts.name})`), asc(gameAccounts.id));
}

export async function findAccount(
  db: DbOrTx,
  userId: string,
  id: string,
): Promise<GameAccount | null> {
  const [row] = await db.select(accountColumns).from(gameAccounts).where(ownAccount(userId, id));
  return row ?? null;
}

export async function insertAccount(
  db: DbOrTx,
  userId: string,
  input: CreateGameAccountInput,
): Promise<GameAccount> {
  const [row] = await db
    .insert(gameAccounts)
    .values({ userId, name: input.name, notes: input.notes ?? null })
    .returning(accountColumns);
  if (!row) throw new Error("insert into game_accounts returned no row");
  return row;
}

/** R-GA-2: vaults 1..settings.vault_count, read in the same statement (same tx as the account). */
export async function insertVaults(db: DbOrTx, userId: string, accountId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO ${storageLocations} (user_id, game_account_id, kind, vault_number)
    SELECT ${userId}, ${accountId}, ${STORAGE_KIND.VAULT}, n
    FROM ${appSettings}, generate_series(1, ${appSettings.vaultCount}) AS n`);
}

export async function updateAccount(
  db: DbOrTx,
  userId: string,
  id: string,
  patch: UpdateGameAccountInput,
): Promise<GameAccount | null> {
  const [row] = await db
    .update(gameAccounts)
    .set(patch)
    .where(ownAccount(userId, id))
    .returning(accountColumns);
  return row ?? null;
}

/** Deletes the account (characters and locations cascade). false when not found. */
export async function deleteAccount(db: DbOrTx, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(gameAccounts)
    .where(ownAccount(userId, id))
    .returning({ id: gameAccounts.id });
  return rows.length > 0;
}

/** Stock entries held anywhere in an account (its vaults and character inventories). */
export async function countAccountEntries(
  db: DbOrTx,
  userId: string,
  accountId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(stockEntries)
    .innerJoin(storageLocations, eq(storageLocations.id, stockEntries.storageLocationId))
    .where(and(eq(stockEntries.userId, userId), eq(storageLocations.gameAccountId, accountId)));
  return row?.n ?? 0;
}

export function listCharacters(
  db: DbOrTx,
  userId: string,
  accountId: string,
): Promise<Character[]> {
  return db
    .select(characterColumns)
    .from(characters)
    .where(and(eq(characters.gameAccountId, accountId), eq(characters.userId, userId)))
    .orderBy(asc(sql`lower(${characters.name})`), asc(characters.id));
}

export async function findCharacter(
  db: DbOrTx,
  userId: string,
  id: string,
): Promise<Character | null> {
  const [row] = await db.select(characterColumns).from(characters).where(ownCharacter(userId, id));
  return row ?? null;
}

export async function insertCharacter(
  db: DbOrTx,
  userId: string,
  accountId: string,
  input: CreateCharacterInput,
): Promise<Character> {
  const [row] = await db
    .insert(characters)
    .values({ userId, gameAccountId: accountId, name: input.name, class: input.class ?? null })
    .returning(characterColumns);
  if (!row) throw new Error("insert into characters returned no row");
  return row;
}

/** R-GA-3 S1: exactly one inventory per character. */
export async function insertInventory(db: DbOrTx, userId: string, ch: Character): Promise<void> {
  await db.insert(storageLocations).values({
    userId,
    gameAccountId: ch.gameAccountId,
    kind: STORAGE_KIND.INVENTORY,
    characterId: ch.id,
  });
}

export async function updateCharacter(
  db: DbOrTx,
  userId: string,
  id: string,
  patch: UpdateCharacterInput,
): Promise<Character | null> {
  const [row] = await db
    .update(characters)
    .set(patch)
    .where(ownCharacter(userId, id))
    .returning(characterColumns);
  return row ?? null;
}

export async function deleteCharacter(db: DbOrTx, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(characters)
    .where(ownCharacter(userId, id))
    .returning({ id: characters.id });
  return rows.length > 0;
}

export async function countCharacterEntries(
  db: DbOrTx,
  userId: string,
  characterId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(stockEntries)
    .innerJoin(storageLocations, eq(storageLocations.id, stockEntries.storageLocationId))
    .where(and(eq(stockEntries.userId, userId), eq(storageLocations.characterId, characterId)));
  return row?.n ?? 0;
}

export async function readVaultCount(db: DbOrTx): Promise<number> {
  const [row] = await db.select({ vaultCount: appSettings.vaultCount }).from(appSettings);
  if (!row) throw new Error("app_settings row missing (migration 0003 seeds it)");
  return row.vaultCount;
}

/** R-GA-3 S3: inventories by character name, then vaults by number, with entry counts. */
export function listStorage(
  db: DbOrTx,
  userId: string,
  accountId: string,
): Promise<StorageLocation[]> {
  return db
    .select({
      id: storageLocations.id,
      kind: storageLocations.kind,
      label: locationLabel,
      vaultNumber: storageLocations.vaultNumber,
      characterId: storageLocations.characterId,
      characterName: characters.name,
      entryCount: count(stockEntries.id),
      overLimit: isOverLimit,
    })
    .from(storageLocations)
    .leftJoin(characters, eq(characters.id, storageLocations.characterId))
    .leftJoin(stockEntries, eq(stockEntries.storageLocationId, storageLocations.id))
    .where(and(eq(storageLocations.gameAccountId, accountId), eq(storageLocations.userId, userId)))
    .groupBy(storageLocations.id, characters.name)
    .orderBy(
      asc(sql`${storageLocations.kind} = ${STORAGE_KIND.VAULT}`),
      asc(sql`lower(${characters.name})`),
      asc(storageLocations.vaultNumber),
    );
}
