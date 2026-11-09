import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config (design 04/06). `generate` and `check` need no database; DATABASE_URL is only
 * read by commands that connect (studio, introspect).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
