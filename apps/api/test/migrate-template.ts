import { runMigrations } from "../src/db/migrate";

/**
 * Applies the app migrations to the template database, so every cloned test database starts
 * migrated. Same runner as the `migrate` CLI (src/cli/migrate.ts).
 */
export async function migrateTemplate(templateUrl: string): Promise<void> {
  await runMigrations(templateUrl);
}
