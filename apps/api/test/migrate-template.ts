import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Drizzle output folder (design 20). Its journal only exists once task 2.5 generates migrations. */
export const MIGRATIONS_DIR = fileURLToPath(new URL("../src/db/migrations", import.meta.url));
const JOURNAL = `${MIGRATIONS_DIR}/meta/_journal.json`;

export function hasMigrations(): boolean {
  return existsSync(JOURNAL);
}

/**
 * Applies the app migrations to the template database, so every cloned test database starts
 * migrated. No-op while there are no migrations yet (phase 1 harness).
 * Task 2.5 replaces the throw with the real runner (the same one `src/cli/migrate.ts` uses).
 */
export async function migrateTemplate(_templateUrl: string): Promise<void> {
  if (!hasMigrations()) return;
  throw new Error(
    `Migrations found in ${MIGRATIONS_DIR} but the test migrator is not wired yet (task 2.5).`,
  );
}
