import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { useTestDatabase } from "../../../test/db";
import { withClient } from "../../../test/pg-admin";
import { expectPgError, insertUser, PG_ERROR } from "../../../test/sql";

/** Task 2.7 / design 04, ADR5, R-SET-1 S1 (+ DB side of S2/S3). */
describe("app_settings singleton", () => {
  const db = useTestDatabase();
  const run = <T>(fn: (client: Client) => Promise<T>) => withClient(db.current.url, fn);

  it("exists with defaults on a fresh database: rate 7.5, 10 vaults (S1)", async () => {
    const rows = await run(async (client) => {
      const result = await client.query<{ mc_to_mp_rate: string; vault_count: number }>(
        "SELECT mc_to_mp_rate, vault_count FROM app_settings",
      );
      return result.rows;
    });
    expect(rows).toEqual([{ mc_to_mp_rate: "7.5000", vault_count: 10 }]);
  });

  it.each([
    ["vault_count = 0", "vault_count = 0"],
    ["vault_count = 51", "vault_count = 51"],
    ["mc_to_mp_rate = 0", "mc_to_mp_rate = 0"],
    ["mc_to_mp_rate = -1", "mc_to_mp_rate = -1"],
  ])("rejects %s", async (_label, assignment) => {
    await run(async (client) => {
      await expectPgError(
        client.query(`UPDATE app_settings SET ${assignment}`),
        PG_ERROR.CHECK_VIOLATION,
      );
    });
  });

  it("cannot hold a second row", async () => {
    await run(async (client) => {
      await expectPgError(
        client.query("INSERT INTO app_settings DEFAULT VALUES"),
        PG_ERROR.UNIQUE_VIOLATION,
      );
      await expectPgError(
        client.query("INSERT INTO app_settings (id) VALUES (false)"),
        PG_ERROR.CHECK_VIOLATION,
      );
    });
  });

  it("records updated_by and clears it when that user is deleted", async () => {
    const after = await run(async (client) => {
      const userId = await insertUser(client, "Admin");
      await client.query("UPDATE app_settings SET updated_by = $1", [userId]);
      await client.query(`DELETE FROM "user" WHERE id = $1`, [userId]);
      const result = await client.query<{ updated_by: string | null }>(
        "SELECT updated_by FROM app_settings",
      );
      return result.rows[0];
    });
    expect(after).toEqual({ updated_by: null });
  });
});
