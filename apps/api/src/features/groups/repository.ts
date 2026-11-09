import type {
  CreateGroupInput,
  StockGroup,
  UpdateGroupInput,
} from "@vaultkeeper/shared/schemas/groups";
import { and, eq, notInArray, sql } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import { catalogItems, stockEntries, stockGroupEntries, stockGroups } from "../../db/schema";
import { lineValueMc } from "../stock/line-value";
import { toTotals, totalsColumns, type TotalsRow } from "../valuation/totals-sql";

/** Every query is scoped by user_id (R-AUTH-5): other users' groups are "not found". */

const ownGroup = (userId: string, id: string) =>
  and(eq(stockGroups.id, id), eq(stockGroups.userId, userId));

export async function findGroup(
  db: DbOrTx,
  userId: string,
  id: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: stockGroups.id })
    .from(stockGroups)
    .where(ownGroup(userId, id));
  return row ?? null;
}

type GroupRow = TotalsRow & {
  id: string;
  name: string;
  description: string | null;
  entry_count: number;
};

/** Groups with entry count and R-VAL-3 totals, by name (one statement). */
export async function listGroups(
  db: DbOrTx,
  userId: string,
  onlyId?: string,
): Promise<StockGroup[]> {
  const result = await db.execute<GroupRow>(sql`
    WITH lines AS (
      SELECT ${stockGroups.id} AS id, ${stockGroups.name} AS name,
        ${stockGroups.description} AS description,
        ${stockEntries.id} AS entry_id, ${lineValueMc} AS v
      FROM ${stockGroups}
      LEFT JOIN ${stockGroupEntries} ON ${stockGroupEntries.groupId} = ${stockGroups.id}
      LEFT JOIN ${stockEntries} ON ${stockEntries.id} = ${stockGroupEntries.stockEntryId}
      LEFT JOIN ${catalogItems} ON ${catalogItems.id} = ${stockEntries.catalogItemId}
      WHERE ${stockGroups.userId} = ${userId}
        ${onlyId === undefined ? sql`` : sql`AND ${stockGroups.id} = ${onlyId}`}
    )
    SELECT id, name, description, COUNT(entry_id)::int AS entry_count, ${totalsColumns}
    FROM lines
    GROUP BY id, name, description
    ORDER BY lower(name), id`);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    entryCount: row.entry_count,
    totals: toTotals(row),
  }));
}

export async function insertGroup(
  db: DbOrTx,
  userId: string,
  input: CreateGroupInput,
): Promise<string> {
  const [row] = await db
    .insert(stockGroups)
    .values({ userId, name: input.name, description: input.description ?? null })
    .returning({ id: stockGroups.id });
  if (!row) throw new Error("insert into stock_groups returned no row");
  return row.id;
}

export async function updateGroup(
  db: DbOrTx,
  userId: string,
  id: string,
  patch: UpdateGroupInput,
): Promise<boolean> {
  const rows = await db
    .update(stockGroups)
    .set(patch)
    .where(ownGroup(userId, id))
    .returning({ id: stockGroups.id });
  return rows.length > 0;
}

/** Memberships cascade; the entries themselves stay (R-GRP-1 S3). */
export async function deleteGroup(db: DbOrTx, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(stockGroups)
    .where(ownGroup(userId, id))
    .returning({ id: stockGroups.id });
  return rows.length > 0;
}

/** Idempotent add (R-GRP-2 S2). The composite FKs reject any cross-user row (ADR2). */
export async function addMembers(
  db: DbOrTx,
  userId: string,
  groupId: string,
  entryIds: readonly string[],
): Promise<void> {
  if (entryIds.length === 0) return;
  await db
    .insert(stockGroupEntries)
    .values(entryIds.map((stockEntryId) => ({ groupId, stockEntryId, userId })))
    .onConflictDoNothing();
}

/** Drops every membership of the group whose entry is not in `keep`. */
export async function removeMembersExcept(
  db: DbOrTx,
  userId: string,
  groupId: string,
  keep: readonly string[],
): Promise<void> {
  await db
    .delete(stockGroupEntries)
    .where(
      and(
        eq(stockGroupEntries.groupId, groupId),
        eq(stockGroupEntries.userId, userId),
        keep.length === 0 ? undefined : notInArray(stockGroupEntries.stockEntryId, [...keep]),
      ),
    );
}

export async function removeMember(
  db: DbOrTx,
  userId: string,
  groupId: string,
  entryId: string,
): Promise<void> {
  await db
    .delete(stockGroupEntries)
    .where(
      and(
        eq(stockGroupEntries.groupId, groupId),
        eq(stockGroupEntries.userId, userId),
        eq(stockGroupEntries.stockEntryId, entryId),
      ),
    );
}
