import { STORAGE_KIND } from "@vaultkeeper/shared/constants";
import type { Settings, UpdateSettingsInput } from "@vaultkeeper/shared/schemas/settings";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import { appSettings, gameAccounts, stockEntries, storageLocations } from "../../db/schema";

const columns = {
  mcToMpRate: appSettings.mcToMpRate,
  vaultCount: appSettings.vaultCount,
  updatedAt: appSettings.updatedAt,
  updatedBy: appSettings.updatedBy,
};

type Row = { mcToMpRate: string; vaultCount: number; updatedAt: Date; updatedBy: string | null };

const toSettings = (row: Row): Settings => ({ ...row, updatedAt: row.updatedAt.toISOString() });

export async function readSettings(db: DbOrTx): Promise<Settings> {
  const [row] = await db.select(columns).from(appSettings);
  if (!row) throw new Error("app_settings row missing (migration 0003 seeds it)");
  return toSettings(row);
}

/** Updates the singleton row (row-locks it for the rest of the transaction). */
export async function updateSettings(
  db: DbOrTx,
  patch: UpdateSettingsInput,
  updatedBy: string,
): Promise<Settings> {
  const [row] = await db
    .update(appSettings)
    .set({ ...patch, updatedBy, updatedAt: sql`now()` })
    .returning(columns);
  if (!row) throw new Error("app_settings row missing (migration 0003 seeds it)");
  return toSettings(row);
}

/** R-GA-5 / R-SET-3 S1: every account gets the missing vaults 1..N (existing ones untouched). */
export async function createMissingVaults(db: DbOrTx, vaultCount: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO ${storageLocations} (user_id, game_account_id, kind, vault_number)
    SELECT ${gameAccounts.userId}, ${gameAccounts.id}, ${STORAGE_KIND.VAULT}, n
    FROM ${gameAccounts} CROSS JOIN generate_series(1, ${vaultCount}::int) AS n
    ON CONFLICT DO NOTHING`);
}

/**
 * R-GA-5 S2: vaults above N are deleted only when EMPTY; non-empty ones stay (flagged over limit).
 * Never deletes stock (the location FK is NO ACTION, so a racing insert makes this fail instead).
 */
export async function deleteEmptyVaultsAbove(db: DbOrTx, vaultCount: number): Promise<void> {
  await db.execute(sql`
    DELETE FROM ${storageLocations}
    WHERE ${storageLocations.kind} = ${STORAGE_KIND.VAULT}
      AND ${storageLocations.vaultNumber} > ${vaultCount}
      AND NOT EXISTS (
        SELECT 1 FROM ${stockEntries} WHERE ${stockEntries.storageLocationId} = ${storageLocations.id}
      )`);
}
