import type { Settings, UpdateSettingsInput } from "@vaultkeeper/shared/schemas/settings";
import type { Database } from "../../db/client";
import * as settingsRepository from "./repository";

export interface SettingsServiceDeps {
  db: Database;
}

/** Global settings (R-SET-1..3): any user reads, only admins update (route guard). */
export function createSettingsService({ db }: SettingsServiceDeps) {
  return {
    get(): Promise<Settings> {
      return settingsRepository.readSettings(db);
    },

    /**
     * One transaction: the settings row lock serializes concurrent updates, and vault
     * reconciliation (R-GA-5) commits together with the new vault_count.
     */
    update(patch: UpdateSettingsInput, adminId: string): Promise<Settings> {
      return db.transaction(async (tx) => {
        const updated = await settingsRepository.updateSettings(tx, patch, adminId);
        if (patch.vaultCount !== undefined) {
          await settingsRepository.createMissingVaults(tx, updated.vaultCount);
          await settingsRepository.deleteEmptyVaultsAbove(tx, updated.vaultCount);
        }
        return updated;
      });
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
