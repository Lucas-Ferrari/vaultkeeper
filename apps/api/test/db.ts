import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, inject } from "vitest";
import { createDatabase, dropDatabase, TEMPLATE_DATABASE, withDatabase } from "./pg-admin";

export interface TestDatabase {
  /** Database name, `t_<16 hex>`. */
  name: string;
  /** Connection URL for this test file's private database. */
  url: string;
}

/** Clones the migrated template into a fresh database (fast, isolated, parallel-safe). */
export async function createTestDatabase(): Promise<TestDatabase> {
  const serverUrl = inject("vkTestServerUrl");
  const name = `t_${randomBytes(8).toString("hex")}`;
  await createDatabase(serverUrl, name, TEMPLATE_DATABASE);
  return { name, url: withDatabase(serverUrl, name) };
}

export async function dropTestDatabase(database: TestDatabase): Promise<void> {
  await dropDatabase(inject("vkTestServerUrl"), database.name);
}

/**
 * One database per test FILE: call at module scope, read `.current` inside tests/hooks.
 *   const db = useTestDatabase();
 *   it("...", async () => { connect(db.current.url) });
 */
export function useTestDatabase(): { readonly current: TestDatabase } {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    if (database) await dropTestDatabase(database);
  });

  return {
    get current(): TestDatabase {
      if (!database) throw new Error("useTestDatabase(): read .current inside a test or hook.");
      return database;
    },
  };
}
