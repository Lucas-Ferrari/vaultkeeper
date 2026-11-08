import { STORAGE_KIND } from "@vaultkeeper/shared/constants";
import { LOCATION_LABEL } from "@vaultkeeper/shared/schemas/game-accounts";
import { sql, type SQL } from "drizzle-orm";
import { appSettings, characters, storageLocations } from "../../db/schema";

/**
 * Location SQL shared by the storage listing and stock rows. Queries using `locationLabel` must
 * LEFT JOIN characters ON characters.id = storage_locations.character_id.
 */

/** "Inventory – <character>" / "Vault <n>" (R-GA-3 S3). */
export const locationLabel: SQL<string> = sql<string>`CASE
  WHEN ${storageLocations.kind} = ${STORAGE_KIND.VAULT}
    THEN ${LOCATION_LABEL.VAULT_PREFIX} || ${storageLocations.vaultNumber}
  ELSE ${LOCATION_LABEL.INVENTORY_PREFIX} || ${characters.name}
END`;

/** Current global vault count (singleton settings row). */
export const currentVaultCount: SQL<number> = sql<number>`(SELECT ${appSettings.vaultCount} FROM ${appSettings})`;

/** R-GA-5: a vault numbered above the current vault_count is "over limit". */
export const isOverLimit: SQL<boolean> = sql<boolean>`COALESCE(${storageLocations.vaultNumber} > ${currentVaultCount}, false)`;
