import { accountStorage, character, gameAccount } from "@vaultkeeper/shared/schemas/game-accounts";
import type {
  AccountStorage,
  Character,
  GameAccount,
} from "@vaultkeeper/shared/schemas/game-accounts";
import { stockEntry, type StockEntry } from "@vaultkeeper/shared/schemas/stock";
import type { Pool } from "pg";
import type { App } from "../src/app";
import { getWith, sendJson } from "./auth-helpers";

export const ACCOUNTS = "/api/v1/game-accounts";
export const CHARACTERS = "/api/v1/characters";
export const STOCK = "/api/v1/stock";

async function expectStatus(response: Response, status: number): Promise<unknown> {
  if (response.status !== status) {
    throw new Error(`expected ${status}, got ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function createAccount(app: App, cookie: string, name: string): Promise<GameAccount> {
  const res = await sendJson(app, "POST", ACCOUNTS, { name }, cookie);
  return gameAccount.parse(await expectStatus(res, 201));
}

export async function createCharacter(
  app: App,
  cookie: string,
  accountId: string,
  name: string,
): Promise<Character> {
  const res = await sendJson(app, "POST", `${ACCOUNTS}/${accountId}/characters`, { name }, cookie);
  return character.parse(await expectStatus(res, 201));
}

export async function getStorage(
  app: App,
  cookie: string,
  accountId: string,
): Promise<AccountStorage> {
  const res = await getWith(app, `${ACCOUNTS}/${accountId}/storage`, cookie);
  return accountStorage.parse(await expectStatus(res, 200));
}

/** Location id by its label ("Vault 3", "Inventory – DarkLord"). */
export async function locationId(
  app: App,
  cookie: string,
  accountId: string,
  label: string,
): Promise<string> {
  const storage = await getStorage(app, cookie, accountId);
  const location = storage.locations.find((l) => l.label === label);
  if (!location) throw new Error(`no location "${label}" in ${JSON.stringify(storage.locations)}`);
  return location.id;
}

export async function createEntry(
  app: App,
  cookie: string,
  body: Record<string, unknown>,
): Promise<StockEntry> {
  const res = await sendJson(app, "POST", STOCK, body, cookie);
  return stockEntry.parse(await expectStatus(res, 201));
}

/** Sets settings.vault_count directly (the settings API lands in a later phase). */
export async function setVaultCount(pool: Pool, vaultCount: number): Promise<void> {
  await pool.query("UPDATE app_settings SET vault_count = $1", [vaultCount]);
}

/** Adds an extra vault directly: with vault_count lowered it is "over limit" (R-GA-5 S3). */
export async function insertVault(
  pool: Pool,
  userId: string,
  accountId: string,
  vaultNumber: number,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO storage_locations (user_id, game_account_id, kind, vault_number)
     VALUES ($1, $2, 'vault', $3) RETURNING id`,
    [userId, accountId, vaultNumber],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("vault insert returned no id");
  return id;
}

/** Inserts a stock group and memberships directly (groups API lands in phase 5). */
export async function insertGroup(
  pool: Pool,
  userId: string,
  name: string,
  entryIds: readonly string[] = [],
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "INSERT INTO stock_groups (user_id, name) VALUES ($1, $2) RETURNING id",
    [userId, name],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("group insert returned no id");
  for (const entryId of entryIds) {
    await pool.query(
      "INSERT INTO stock_group_entries (group_id, stock_entry_id, user_id) VALUES ($1, $2, $3)",
      [id, entryId, userId],
    );
  }
  return id;
}

export async function countRows(pool: Pool, sqlText: string, params: unknown[]): Promise<number> {
  const result = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ${sqlText}`,
    params,
  );
  return Number(result.rows[0]?.n ?? 0);
}
