import type { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../../../test/db";
import { withClient } from "../../../test/pg-admin";
import { expectPgError, insertUser, PG_ERROR } from "../../../test/sql";

/** Task 2.8 / design 05, ADR2: R-GA-1, R-GA-3 and the ownership composite FKs. */
describe("game accounts, characters and storage locations", () => {
  const db = useTestDatabase();
  const run = <T>(fn: (client: Client) => Promise<T>) => withClient(db.current.url, fn);

  let alice: string;
  let bob: string;

  async function insertAccount(client: Client, userId: string, name: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      "INSERT INTO game_accounts (user_id, name) VALUES ($1, $2) RETURNING id",
      [userId, name],
    );
    return result.rows[0]?.id ?? "";
  }

  async function insertCharacter(
    client: Client,
    userId: string,
    accountId: string,
    name: string,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      "INSERT INTO characters (user_id, game_account_id, name) VALUES ($1, $2, $3) RETURNING id",
      [userId, accountId, name],
    );
    return result.rows[0]?.id ?? "";
  }

  function insertLocation(
    client: Client,
    location: {
      userId: string;
      accountId: string;
      kind: string;
      characterId?: string | null;
      vaultNumber?: number | null;
    },
  ) {
    return client.query(
      `INSERT INTO storage_locations (user_id, game_account_id, kind, character_id, vault_number)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        location.userId,
        location.accountId,
        location.kind,
        location.characterId ?? null,
        location.vaultNumber ?? null,
      ],
    );
  }

  beforeAll(async () => {
    await run(async (client) => {
      alice = await insertUser(client, "Alice");
      bob = await insertUser(client, "Bob");
    });
  });

  describe("game_accounts (R-GA-1)", () => {
    it("rejects a second 'main' for the same user, allows it for another user (S2/S3)", async () => {
      await run(async (client) => {
        await insertAccount(client, alice, "Main");
        await expectPgError(insertAccount(client, alice, "main"), PG_ERROR.UNIQUE_VIOLATION);
        await insertAccount(client, bob, "Main");
      });
    });

    it("enforces name length 1..50", async () => {
      await run(async (client) => {
        await expectPgError(insertAccount(client, alice, ""), PG_ERROR.CHECK_VIOLATION);
        await expectPgError(insertAccount(client, alice, "x".repeat(51)), PG_ERROR.CHECK_VIOLATION);
        await insertAccount(client, alice, "y".repeat(50));
      });
    });
  });

  describe("characters (R-GA-3)", () => {
    it("is unique per account case-insensitively, reusable in another account (S2)", async () => {
      await run(async (client) => {
        const main = await insertAccount(client, alice, "Chars-Main");
        const alt = await insertAccount(client, alice, "Chars-Alt");
        await insertCharacter(client, alice, main, "DarkLord");
        await expectPgError(
          insertCharacter(client, alice, main, "darklord"),
          PG_ERROR.UNIQUE_VIOLATION,
        );
        await insertCharacter(client, alice, alt, "DarkLord");
      });
    });

    it("enforces name length 1..10 (MU limit)", async () => {
      await run(async (client) => {
        const account = await insertAccount(client, alice, "Chars-Len");
        await expectPgError(insertCharacter(client, alice, account, ""), PG_ERROR.CHECK_VIOLATION);
        await expectPgError(
          insertCharacter(client, alice, account, "x".repeat(11)),
          PG_ERROR.CHECK_VIOLATION,
        );
        await insertCharacter(client, alice, account, "y".repeat(10));
      });
    });

    it("cannot belong to another user's account (composite FK)", async () => {
      await run(async (client) => {
        const bobs = await insertAccount(client, bob, "Bob-Chars");
        await expectPgError(
          insertCharacter(client, alice, bobs, "Intruder"),
          PG_ERROR.FOREIGN_KEY_VIOLATION,
        );
      });
    });
  });

  describe("storage_locations", () => {
    it("requires character_id (and no vault_number) for an inventory", async () => {
      await run(async (client) => {
        const account = await insertAccount(client, alice, "Loc-Inv");
        const character = await insertCharacter(client, alice, account, "Elf");
        await expectPgError(
          insertLocation(client, { userId: alice, accountId: account, kind: "inventory" }),
          PG_ERROR.CHECK_VIOLATION,
        );
        await expectPgError(
          insertLocation(client, {
            userId: alice,
            accountId: account,
            kind: "inventory",
            characterId: character,
            vaultNumber: 1,
          }),
          PG_ERROR.CHECK_VIOLATION,
        );
        await insertLocation(client, {
          userId: alice,
          accountId: account,
          kind: "inventory",
          characterId: character,
        });
      });
    });

    it("allows exactly one inventory per character", async () => {
      await run(async (client) => {
        const account = await insertAccount(client, alice, "Loc-OneInv");
        const character = await insertCharacter(client, alice, account, "Mage");
        const inventory = {
          userId: alice,
          accountId: account,
          kind: "inventory",
          characterId: character,
        };
        await insertLocation(client, inventory);
        await expectPgError(insertLocation(client, inventory), PG_ERROR.UNIQUE_VIOLATION);
      });
    });

    it("requires vault_number 1..50 (and no character) for a vault", async () => {
      await run(async (client) => {
        const account = await insertAccount(client, alice, "Loc-Vault");
        const character = await insertCharacter(client, alice, account, "Knight");
        const vault = { userId: alice, accountId: account, kind: "vault" };
        for (const vaultNumber of [null, 0, 51]) {
          await expectPgError(
            insertLocation(client, { ...vault, vaultNumber }),
            PG_ERROR.CHECK_VIOLATION,
          );
        }
        await expectPgError(
          insertLocation(client, { ...vault, vaultNumber: 2, characterId: character }),
          PG_ERROR.CHECK_VIOLATION,
        );
        await insertLocation(client, { ...vault, vaultNumber: 1 });
        await insertLocation(client, { ...vault, vaultNumber: 50 });
      });
    });

    it("rejects unknown kinds", async () => {
      await run(async (client) => {
        const account = await insertAccount(client, alice, "Loc-Kind");
        await expectPgError(
          insertLocation(client, {
            userId: alice,
            accountId: account,
            kind: "bank",
            vaultNumber: 1,
          }),
          PG_ERROR.CHECK_VIOLATION,
        );
      });
    });

    it("keeps vault numbers unique per account, reusable across accounts", async () => {
      await run(async (client) => {
        const first = await insertAccount(client, alice, "Loc-VaultA");
        const second = await insertAccount(client, alice, "Loc-VaultB");
        await insertLocation(client, {
          userId: alice,
          accountId: first,
          kind: "vault",
          vaultNumber: 3,
        });
        await expectPgError(
          insertLocation(client, {
            userId: alice,
            accountId: first,
            kind: "vault",
            vaultNumber: 3,
          }),
          PG_ERROR.UNIQUE_VIOLATION,
        );
        await insertLocation(client, {
          userId: alice,
          accountId: second,
          kind: "vault",
          vaultNumber: 3,
        });
      });
    });

    it("cannot be backed by a character of another account (composite FK)", async () => {
      await run(async (client) => {
        const accountA = await insertAccount(client, alice, "Loc-FK-A");
        const accountB = await insertAccount(client, alice, "Loc-FK-B");
        const characterOfA = await insertCharacter(client, alice, accountA, "Summoner");
        await expectPgError(
          insertLocation(client, {
            userId: alice,
            accountId: accountB,
            kind: "inventory",
            characterId: characterOfA,
          }),
          PG_ERROR.FOREIGN_KEY_VIOLATION,
        );
      });
    });

    it("cannot point at another user's account (composite FK)", async () => {
      await run(async (client) => {
        const bobs = await insertAccount(client, bob, "Bob-Vaults");
        await expectPgError(
          insertLocation(client, { userId: alice, accountId: bobs, kind: "vault", vaultNumber: 1 }),
          PG_ERROR.FOREIGN_KEY_VIOLATION,
        );
      });
    });

    it("goes away with its character, and the account takes everything with it", async () => {
      const remaining = await run(async (client) => {
        const account = await insertAccount(client, alice, "Loc-Cascade");
        const character = await insertCharacter(client, alice, account, "Gladiator");
        await insertLocation(client, {
          userId: alice,
          accountId: account,
          kind: "inventory",
          characterId: character,
        });
        await insertLocation(client, {
          userId: alice,
          accountId: account,
          kind: "vault",
          vaultNumber: 1,
        });
        await client.query("DELETE FROM characters WHERE id = $1", [character]);
        const afterCharacter = await client.query<{ count: string }>(
          "SELECT count(*) FROM storage_locations WHERE game_account_id = $1",
          [account],
        );
        await client.query("DELETE FROM game_accounts WHERE id = $1", [account]);
        const afterAccount = await client.query<{ count: string }>(
          "SELECT count(*) FROM storage_locations WHERE game_account_id = $1",
          [account],
        );
        return [afterCharacter.rows[0]?.count, afterAccount.rows[0]?.count];
      });
      expect(remaining).toEqual(["1", "0"]);
    });
  });
});
