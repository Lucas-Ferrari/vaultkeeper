import { describe, expect, it } from "vitest";
import { useTestDatabase } from "./db";
import { withClient } from "./pg-admin";

describe("api-int harness", () => {
  const db = useTestDatabase();

  it("connects to a private per-file database cloned from the template", async () => {
    const row = await withClient(db.current.url, async (client) => {
      const result = await client.query<{ one: number; database: string; version: string }>(
        "SELECT 1 AS one, current_database() AS database, current_setting('server_version_num') AS version",
      );
      return result.rows[0];
    });

    expect(row?.one).toBe(1);
    expect(row?.database).toBe(db.current.name);
    expect(Number(row?.version)).toBeGreaterThanOrEqual(170_000);
  });
});
