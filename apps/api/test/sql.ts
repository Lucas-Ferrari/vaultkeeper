import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { expect } from "vitest";

/** Postgres SQLSTATE codes the schema tests assert on. */
export const PG_ERROR = {
  UNIQUE_VIOLATION: "23505",
  CHECK_VIOLATION: "23514",
  FOREIGN_KEY_VIOLATION: "23503",
  NOT_NULL_VIOLATION: "23502",
} as const;
export type PgErrorCode = (typeof PG_ERROR)[keyof typeof PG_ERROR];

function sqlState(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  // Drizzle wraps driver errors (DrizzleQueryError.cause).
  if ("cause" in error) return sqlState(error.cause);
  return undefined;
}

/** Asserts `promise` rejects with the given SQLSTATE (and returns the error for more checks). */
export async function expectPgError(
  promise: Promise<unknown>,
  code: PgErrorCode,
): Promise<unknown> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error, `expected SQLSTATE ${code}, but the statement succeeded`).toBeDefined();
  expect(sqlState(error)).toBe(code);
  return error;
}

/** Lists the public tables of the connected database. */
export async function publicTables(client: Client): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1",
  );
  return result.rows.map((row) => row.table_name);
}

/** Inserts a bare Better Auth user row and returns its id (text, ADR: user.id is TEXT). */
export async function insertUser(client: Client, name = "Tester"): Promise<string> {
  const id = randomUUID();
  await client.query(`INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)`, [
    id,
    name,
    `${id}@test.local`,
  ]);
  return id;
}
