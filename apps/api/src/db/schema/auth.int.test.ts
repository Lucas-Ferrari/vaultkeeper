import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { useTestDatabase } from "../../../test/db";
import { withClient } from "../../../test/pg-admin";
import { insertUser, publicTables } from "../../../test/sql";

/** Task 2.6 / design 04: Better Auth tables incl. admin-plugin columns. */
describe("auth tables", () => {
  const db = useTestDatabase();

  it("creates user, session, account and verification", async () => {
    const tables = await withClient(db.current.url, publicTables);
    expect(tables).toEqual(expect.arrayContaining(["user", "session", "account", "verification"]));
  });

  it("has the admin plugin columns and defaults user.role to 'user'", async () => {
    const row = await withClient(db.current.url, async (client) => {
      const id = await insertUser(client);
      const result = await client.query<{ role: string; banned: boolean | null }>(
        `SELECT role, banned, ban_reason, ban_expires FROM "user" WHERE id = $1`,
        [id],
      );
      await client.query(`SELECT impersonated_by FROM session LIMIT 0`);
      return result.rows[0];
    });

    expect(row?.role).toBe("user");
  });

  it("deletes a user's sessions and accounts with the user", async () => {
    const counts = await withClient(db.current.url, async (client) => {
      const userId = await insertUser(client);
      await client.query(
        `INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, now() + interval '1 day', now(), now())`,
        [randomUUID(), randomUUID(), userId],
      );
      await client.query(
        `INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at)
         VALUES ($1, $2, 'credential', $3, now(), now())`,
        [randomUUID(), userId, userId],
      );
      await client.query(`DELETE FROM "user" WHERE id = $1`, [userId]);
      const result = await client.query<{ sessions: string; accounts: string }>(
        `SELECT (SELECT count(*) FROM session WHERE user_id = $1) AS sessions,
                (SELECT count(*) FROM account WHERE user_id = $1) AS accounts`,
        [userId],
      );
      return result.rows[0];
    });

    expect(counts).toEqual({ sessions: "0", accounts: "0" });
  });
});
