import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client";

/** drizzle-kit output folder (drizzle.config.ts `out`). */
export const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations", import.meta.url));

export interface RunMigrationsOptions {
  /** Override for bundled builds where migrations ship next to the bundle (task 7.1). */
  migrationsFolder?: string;
}

/**
 * Applies pending migrations (R-DEP-2). Safe to re-run: Drizzle records applied migrations in
 * drizzle.__drizzle_migrations and skips them; custom SQL is written idempotently as well.
 * Used by the `migrate` CLI (before the API serves traffic) and by the api-int global setup.
 */
export async function runMigrations(
  connectionString: string,
  options: RunMigrationsOptions = {},
): Promise<void> {
  const handle = createDatabase(connectionString);
  try {
    await migrate(handle.db, { migrationsFolder: options.migrationsFolder ?? MIGRATIONS_DIR });
  } finally {
    await handle.close();
  }
}
