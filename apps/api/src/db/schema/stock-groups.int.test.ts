import type { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../../test/db";
import { withClient } from "../../../test/pg-admin";
import { expectPgError, insertUser, PG_ERROR } from "../../../test/sql";

/**
 * Task 2.9 / design 06, ADR2 + ADR8: R-AUTH-5 S3 (cross-user refs impossible), R-GA-4 (locations
 * with stock cannot be deleted, the user can), R-STK-1/3 (field limits, entry delete drops
 * memberships), R-GRP-1/2.
 */
describe("stock entries and groups", () => {
  const db = useTestDatabase();
  const run = <T>(fn: (client: Client) => Promise<T>) => withClient(db.current.url, fn);

  let itemId: string;

  interface Owner {
    userId: string;
    accountId: string;
    characterId: string;
    inventoryId: string;
    vaultId: string;
  }

  async function first<T>(client: Client, text: string, values: unknown[]): Promise<T> {
    const result = await client.query(text, values);
    const row: unknown = result.rows[0];
    if (row === undefined) throw new Error(`no row returned by: ${text}`);
    return row as T;
  }

  /** User -> account -> character (+ inventory) and vault 1, i.e. what the services will create. */
  async function createOwner(client: Client, name: string): Promise<Owner> {
    const userId = await insertUser(client, name);
    const { id: accountId } = await first<{ id: string }>(
      client,
      "INSERT INTO game_accounts (user_id, name) VALUES ($1, 'Main') RETURNING id",
      [userId],
    );
    const { id: characterId } = await first<{ id: string }>(
      client,
      "INSERT INTO characters (user_id, game_account_id, name) VALUES ($1, $2, 'DarkLord') RETURNING id",
      [userId, accountId],
    );
    const { id: inventoryId } = await first<{ id: string }>(
      client,
      `INSERT INTO storage_locations (user_id, game_account_id, kind, character_id)
       VALUES ($1, $2, 'inventory', $3) RETURNING id`,
      [userId, accountId, characterId],
    );
    const { id: vaultId } = await first<{ id: string }>(
      client,
      `INSERT INTO storage_locations (user_id, game_account_id, kind, vault_number)
       VALUES ($1, $2, 'vault', 1) RETURNING id`,
      [userId, accountId],
    );
    return { userId, accountId, characterId, inventoryId, vaultId };
  }

  interface EntryInput {
    userId: string;
    locationId: string;
    level?: number;
    quantity?: number;
    options?: string | null;
    notes?: string | null;
    priceMc?: string | null;
  }

  async function insertEntry(client: Client, entry: EntryInput): Promise<string> {
    const row = await first<{ id: string }>(
      client,
      `INSERT INTO stock_entries
         (user_id, storage_location_id, catalog_item_id, level, quantity, options, notes, price_mc)
       VALUES ($1, $2, $3, COALESCE($4, 0), COALESCE($5, 1), $6, $7, $8) RETURNING id`,
      [
        entry.userId,
        entry.locationId,
        itemId,
        entry.level ?? null,
        entry.quantity ?? null,
        entry.options ?? null,
        entry.notes ?? null,
        entry.priceMc ?? null,
      ],
    );
    return row.id;
  }

  async function insertGroup(client: Client, userId: string, name: string): Promise<string> {
    const row = await first<{ id: string }>(
      client,
      "INSERT INTO stock_groups (user_id, name) VALUES ($1, $2) RETURNING id",
      [userId, name],
    );
    return row.id;
  }

  function addMember(client: Client, userId: string, groupId: string, entryId: string) {
    return client.query(
      "INSERT INTO stock_group_entries (user_id, group_id, stock_entry_id) VALUES ($1, $2, $3)",
      [userId, groupId, entryId],
    );
  }

  async function count(client: Client, table: string, where: string, values: unknown[]) {
    const row = await first<{ count: string }>(
      client,
      `SELECT count(*) FROM ${table} WHERE ${where}`,
      values,
    );
    return Number(row.count);
  }

  beforeAll(async () => {
    await run(async (client) => {
      await client.query(
        "INSERT INTO item_categories (slug, name, icon) VALUES ('wings', 'Wings', 'wings')",
      );
      const row = await first<{ id: string }>(
        client,
        `INSERT INTO catalog_items (category_slug, name, source)
         VALUES ('wings', 'Wings of Storm', 'admin') RETURNING id`,
        [],
      );
      itemId = row.id;
    });
  });

  describe("stock_entries (R-STK-1)", () => {
    it("defaults level 0 / quantity 1 and keeps the price override exact", async () => {
      const row = await run(async (client) => {
        const owner = await createOwner(client, "Defaults");
        const id = await insertEntry(client, {
          userId: owner.userId,
          locationId: owner.vaultId,
          priceMc: "1500.5",
        });
        return first<{ level: number; quantity: number; price_mc: string }>(
          client,
          "SELECT level, quantity, price_mc FROM stock_entries WHERE id = $1",
          [id],
        );
      });
      expect(row).toEqual({ level: 0, quantity: 1, price_mc: "1500.50" });
    });

    it.each([
      ["level 16", { level: 16 }],
      ["level -1", { level: -1 }],
      ["quantity 0", { quantity: 0 }],
      ["quantity 10000", { quantity: 10_000 }],
      ["negative price", { priceMc: "-0.01" }],
      ["options > 500 chars", { options: "o".repeat(501) }],
      ["notes > 500 chars", { notes: "n".repeat(501) }],
    ])("rejects %s", async (_label, input) => {
      await run(async (client) => {
        const owner = await createOwner(client, "Limits");
        await expectPgError(
          insertEntry(client, { userId: owner.userId, locationId: owner.vaultId, ...input }),
          PG_ERROR.CHECK_VIOLATION,
        );
      });
    });

    it("accepts the boundaries (level 15, qty 9999, 500-char options/notes)", async () => {
      await run(async (client) => {
        const owner = await createOwner(client, "Bounds");
        await insertEntry(client, {
          userId: owner.userId,
          locationId: owner.inventoryId,
          level: 15,
          quantity: 9999,
          options: "o".repeat(500),
          notes: "n".repeat(500),
        });
      });
    });

    it("cannot be created in another user's location (R-AUTH-5 S3)", async () => {
      await run(async (client) => {
        const alice = await createOwner(client, "Alice");
        const bob = await createOwner(client, "Bob");
        await expectPgError(
          insertEntry(client, { userId: bob.userId, locationId: alice.vaultId }),
          PG_ERROR.FOREIGN_KEY_VIOLATION,
        );
      });
    });

    it("cannot be moved into another user's location (R-AUTH-5 S3)", async () => {
      await run(async (client) => {
        const alice = await createOwner(client, "Alice-Move");
        const bob = await createOwner(client, "Bob-Move");
        const entry = await insertEntry(client, { userId: bob.userId, locationId: bob.vaultId });
        await expectPgError(
          client.query("UPDATE stock_entries SET storage_location_id = $1 WHERE id = $2", [
            alice.vaultId,
            entry,
          ]),
          PG_ERROR.FOREIGN_KEY_VIOLATION,
        );
      });
    });

    it("protects a referenced catalog item from deletion (RESTRICT)", async () => {
      await run(async (client) => {
        const owner = await createOwner(client, "Restrict");
        await insertEntry(client, { userId: owner.userId, locationId: owner.vaultId });
        await expectPgError(
          client.query("DELETE FROM catalog_items WHERE id = $1", [itemId]),
          PG_ERROR.FOREIGN_KEY_VIOLATION,
        );
      });
    });
  });

  describe("deletion safety (R-GA-4, ADR8)", () => {
    it("refuses to delete a location, character or account that still holds stock", async () => {
      await run(async (client) => {
        const owner = await createOwner(client, "Holder");
        await insertEntry(client, { userId: owner.userId, locationId: owner.inventoryId });
        await insertEntry(client, { userId: owner.userId, locationId: owner.vaultId });

        await expectPgError(
          client.query("DELETE FROM storage_locations WHERE id = $1", [owner.vaultId]),
          PG_ERROR.FOREIGN_KEY_VIOLATION,
        );
        await expectPgError(
          client.query("DELETE FROM characters WHERE id = $1", [owner.characterId]),
          PG_ERROR.FOREIGN_KEY_VIOLATION,
        );
        await expectPgError(
          client.query("DELETE FROM game_accounts WHERE id = $1", [owner.accountId]),
          PG_ERROR.FOREIGN_KEY_VIOLATION,
        );
        expect(await count(client, "stock_entries", "user_id = $1", [owner.userId])).toBe(2);
      });
    });

    it("cascades everything when the USER is deleted", async () => {
      const remaining = await run(async (client) => {
        const owner = await createOwner(client, "Leaver");
        const entry = await insertEntry(client, {
          userId: owner.userId,
          locationId: owner.vaultId,
        });
        const group = await insertGroup(client, owner.userId, "Set");
        await addMember(client, owner.userId, group, entry);

        await client.query(`DELETE FROM "user" WHERE id = $1`, [owner.userId]);

        const tables = [
          "game_accounts",
          "characters",
          "storage_locations",
          "stock_entries",
          "stock_groups",
          "stock_group_entries",
        ];
        const counts: Record<string, number> = {};
        for (const table of tables) {
          counts[table] = await count(client, table, "user_id = $1", [owner.userId]);
        }
        return counts;
      });
      expect(Object.values(remaining)).toEqual([0, 0, 0, 0, 0, 0]);
    });
  });

  describe("stock_groups (R-GRP-1)", () => {
    it("is unique per user case-insensitively, reusable by another user", async () => {
      await run(async (client) => {
        const alice = await createOwner(client, "Alice-Groups");
        const bob = await createOwner(client, "Bob-Groups");
        await insertGroup(client, alice.userId, "Dark Phoenix Set");
        await expectPgError(
          insertGroup(client, alice.userId, "dark phoenix set"),
          PG_ERROR.UNIQUE_VIOLATION,
        );
        await insertGroup(client, bob.userId, "Dark Phoenix Set");
      });
    });

    it("enforces name 1..60 and description <= 500", async () => {
      await run(async (client) => {
        const owner = await createOwner(client, "Group-Limits");
        await expectPgError(insertGroup(client, owner.userId, ""), PG_ERROR.CHECK_VIOLATION);
        await expectPgError(
          insertGroup(client, owner.userId, "g".repeat(61)),
          PG_ERROR.CHECK_VIOLATION,
        );
        await expectPgError(
          client.query(
            "INSERT INTO stock_groups (user_id, name, description) VALUES ($1, 'D', $2)",
            [owner.userId, "d".repeat(501)],
          ),
          PG_ERROR.CHECK_VIOLATION,
        );
      });
    });
  });

  describe("stock_group_entries (R-GRP-2, R-AUTH-5 S3)", () => {
    it("rejects a membership whose user_id does not own both group and entry", async () => {
      await run(async (client) => {
        const alice = await createOwner(client, "Alice-Members");
        const bob = await createOwner(client, "Bob-Members");
        const aliceEntry = await insertEntry(client, {
          userId: alice.userId,
          locationId: alice.vaultId,
        });
        const bobEntry = await insertEntry(client, { userId: bob.userId, locationId: bob.vaultId });
        const bobGroup = await insertGroup(client, bob.userId, "Bob's");
        const aliceGroup = await insertGroup(client, alice.userId, "Alice's");

        // Alice's entry into Bob's group, with either owner on the row.
        await expectPgError(
          addMember(client, bob.userId, bobGroup, aliceEntry),
          PG_ERROR.FOREIGN_KEY_VIOLATION,
        );
        await expectPgError(
          addMember(client, alice.userId, bobGroup, aliceEntry),
          PG_ERROR.FOREIGN_KEY_VIOLATION,
        );
        // Bob's entry into Alice's group.
        await expectPgError(
          addMember(client, bob.userId, aliceGroup, bobEntry),
          PG_ERROR.FOREIGN_KEY_VIOLATION,
        );
      });
    });

    it("holds an entry at most once per group, in many groups (S2/S3)", async () => {
      await run(async (client) => {
        const owner = await createOwner(client, "Many");
        const entry = await insertEntry(client, {
          userId: owner.userId,
          locationId: owner.vaultId,
        });
        const g1 = await insertGroup(client, owner.userId, "G1");
        const g2 = await insertGroup(client, owner.userId, "G2");
        await addMember(client, owner.userId, g1, entry);
        await addMember(client, owner.userId, g2, entry);
        await expectPgError(addMember(client, owner.userId, g1, entry), PG_ERROR.UNIQUE_VIOLATION);
      });
    });

    it("drops memberships with the entry but keeps the groups (R-STK-3 S1)", async () => {
      const after = await run(async (client) => {
        const owner = await createOwner(client, "Drop");
        const entry = await insertEntry(client, {
          userId: owner.userId,
          locationId: owner.vaultId,
        });
        const g1 = await insertGroup(client, owner.userId, "G1");
        const g2 = await insertGroup(client, owner.userId, "G2");
        await addMember(client, owner.userId, g1, entry);
        await addMember(client, owner.userId, g2, entry);

        await client.query("DELETE FROM stock_entries WHERE id = $1", [entry]);

        return {
          memberships: await count(client, "stock_group_entries", "user_id = $1", [owner.userId]),
          groups: await count(client, "stock_groups", "user_id = $1", [owner.userId]),
        };
      });
      expect(after).toEqual({ memberships: 0, groups: 2 });
    });

    it("drops memberships with the group but keeps the entries (R-GRP-1 S3)", async () => {
      const after = await run(async (client) => {
        const owner = await createOwner(client, "DropGroup");
        const entry = await insertEntry(client, {
          userId: owner.userId,
          locationId: owner.vaultId,
        });
        const group = await insertGroup(client, owner.userId, "Gone");
        await addMember(client, owner.userId, group, entry);

        await client.query("DELETE FROM stock_groups WHERE id = $1", [group]);

        return {
          memberships: await count(client, "stock_group_entries", "user_id = $1", [owner.userId]),
          entries: await count(client, "stock_entries", "user_id = $1", [owner.userId]),
        };
      });
      expect(after).toEqual({ memberships: 0, entries: 1 });
    });
  });
});
