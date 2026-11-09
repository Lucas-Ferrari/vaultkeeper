import type {
  AccountValuation,
  LocationValuation,
  ValuationSummary,
  ValuationTotals,
} from "@vaultkeeper/shared/schemas/valuation";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import {
  appSettings,
  catalogItems,
  characters,
  gameAccounts,
  stockEntries,
  stockGroupEntries,
  storageLocations,
} from "../../db/schema";
import { locationLabel } from "../game-accounts/location-sql";
import { lineValueMc } from "../stock/line-value";
import { toTotals, totalsColumns, type TotalsRow } from "./totals-sql";

type SummaryRow = TotalsRow & {
  level: "all" | "account" | "location";
  account_id: string | null;
  account_name: string | null;
  location_id: string | null;
  kind: LocationValuation["kind"] | null;
  character_id: string | null;
  label: string | null;
};

/**
 * R-VAL-3 overall + per-account + per-location totals in ONE statement (design 07): every account
 * of the user (empty ones too, at 0), only locations that hold stock. A character's total is its
 * inventory row. `accountId` narrows everything to that account.
 */
export async function summary(
  db: DbOrTx,
  userId: string,
  accountId: string | undefined,
): Promise<Omit<ValuationSummary, "mcToMpRate">> {
  const result = await db.execute<SummaryRow>(sql`
    WITH lines AS (
      SELECT ${gameAccounts.id} AS account_id, ${gameAccounts.name} AS account_name,
        ${storageLocations.id} AS location_id, ${storageLocations.kind} AS kind,
        ${storageLocations.characterId} AS character_id, ${storageLocations.vaultNumber} AS vault_number,
        ${characters.name} AS character_name, ${locationLabel} AS label,
        ${stockEntries.id} AS entry_id, ${lineValueMc} AS v
      FROM ${gameAccounts}
      LEFT JOIN ${storageLocations} ON ${storageLocations.gameAccountId} = ${gameAccounts.id}
      LEFT JOIN ${characters} ON ${characters.id} = ${storageLocations.characterId}
      LEFT JOIN ${stockEntries} ON ${stockEntries.storageLocationId} = ${storageLocations.id}
      LEFT JOIN ${catalogItems} ON ${catalogItems.id} = ${stockEntries.catalogItemId}
      WHERE ${gameAccounts.userId} = ${userId}
        ${accountId === undefined ? sql`` : sql`AND ${gameAccounts.id} = ${accountId}`}
    )
    SELECT
      CASE WHEN GROUPING(account_id) = 1 THEN 'all'
           WHEN GROUPING(location_id) = 1 THEN 'account' ELSE 'location' END AS level,
      account_id, account_name, location_id, kind, character_id, label,
      ${totalsColumns}
    FROM lines
    GROUP BY GROUPING SETS (
      (),
      (account_id, account_name),
      (account_id, account_name, location_id, kind, character_id, vault_number, character_name, label)
    )
    HAVING GROUPING(location_id) = 1 OR COUNT(entry_id) > 0
    ORDER BY lower(account_name) NULLS FIRST, account_id NULLS FIRST,
      location_id NULLS FIRST, kind = 'vault', lower(character_name), vault_number`);

  let totals: ValuationTotals | undefined;
  const byAccount: AccountValuation[] = [];
  const byLocation: LocationValuation[] = [];
  for (const row of result.rows) {
    if (row.level === "all") totals = toTotals(row);
    else if (row.level === "account") {
      byAccount.push({
        accountId: row.account_id ?? "",
        accountName: row.account_name ?? "",
        ...toTotals(row),
      });
    } else {
      byLocation.push({
        locationId: row.location_id ?? "",
        accountId: row.account_id ?? "",
        kind: row.kind ?? "vault",
        label: row.label ?? "",
        characterId: row.character_id,
        ...toTotals(row),
      });
    }
  }
  if (!totals) throw new Error("valuation summary returned no grand total row");
  return { totals, byAccount, byLocation };
}

/** Totals of one group's members (R-GRP-3, R-VAL-3 S3); the caller checks ownership. */
export async function groupTotals(
  db: DbOrTx,
  userId: string,
  groupId: string,
): Promise<ValuationTotals> {
  const result = await db.execute<TotalsRow>(sql`
    WITH lines AS (
      SELECT ${stockEntries.id} AS entry_id, ${lineValueMc} AS v
      FROM ${stockGroupEntries}
      JOIN ${stockEntries} ON ${stockEntries.id} = ${stockGroupEntries.stockEntryId}
      JOIN ${catalogItems} ON ${catalogItems.id} = ${stockEntries.catalogItemId}
      WHERE ${stockGroupEntries.groupId} = ${groupId} AND ${stockGroupEntries.userId} = ${userId}
    )
    SELECT ${totalsColumns} FROM lines`);
  const [row] = result.rows;
  if (!row) throw new Error("group totals returned no row");
  return toTotals(row);
}

export async function readRate(db: DbOrTx): Promise<string> {
  const [row] = await db.select({ rate: appSettings.mcToMpRate }).from(appSettings);
  if (!row) throw new Error("app_settings row missing (migration 0003 seeds it)");
  return row.rate;
}
