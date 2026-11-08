import { z } from "zod";
import { runMigrations } from "../db/migrate";

/**
 * `migrate` CLI (R-DEP-2): applies pending migrations, then exits. Runs before the API starts
 * (compose command / task 7.x). Only needs DATABASE_URL, not the full API env.
 */
const migrateEnv = z.object({ DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }) });

async function main(): Promise<void> {
  const parsed = migrateEnv.safeParse(process.env);
  if (!parsed.success) {
    console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
    process.exit(1);
  }
  await runMigrations(parsed.data.DATABASE_URL);
  console.info("Migrations applied.");
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
