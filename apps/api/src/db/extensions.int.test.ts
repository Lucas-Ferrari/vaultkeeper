import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { useTestDatabase } from "../../test/db";
import { withClient } from "../../test/pg-admin";
import { MIGRATIONS_DIR, runMigrations } from "./migrate";

const execFileAsync = promisify(execFile);

/** Task 2.5 / design 04: search extensions + the IMMUTABLE unaccent wrapper (R-DEP-2). */
describe("migration 0000_extensions", () => {
  const db = useTestDatabase();

  it("installs pg_trgm and unaccent", async () => {
    const names = await withClient(db.current.url, async (client) => {
      const result = await client.query<{ extname: string }>(
        "SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'unaccent') ORDER BY extname",
      );
      return result.rows.map((row) => row.extname);
    });

    expect(names).toEqual(["pg_trgm", "unaccent"]);
  });

  it("defines public.immutable_unaccent as IMMUTABLE and folds accents", async () => {
    const row = await withClient(db.current.url, async (client) => {
      const result = await client.query<{ folded: string; volatility: string }>(
        `SELECT public.immutable_unaccent(lower('Ígnea')) AS folded,
                (SELECT provolatile FROM pg_proc
                  WHERE oid = 'public.immutable_unaccent(text)'::regprocedure) AS volatility`,
      );
      return result.rows[0];
    });

    expect(row?.folded).toBe("ignea");
    expect(row?.volatility).toBe("i");
  });

  it("is safe to re-run (R-DEP-2 S2): the runner skips applied migrations", async () => {
    await expect(runMigrations(db.current.url)).resolves.toBeUndefined();
    await expect(runMigrations(db.current.url)).resolves.toBeUndefined();
  });

  it("is idempotent even when its SQL is replayed outside the journal", async () => {
    const sql = await readFile(`${MIGRATIONS_DIR}/0000_extensions.sql`, "utf8");
    await withClient(db.current.url, async (client) => {
      for (const statement of sql.split("--> statement-breakpoint")) {
        await client.query(statement);
      }
    });
  });

  it("migrates through the CLI with only DATABASE_URL set", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--import", "tsx", fileURLToPath(new URL("../cli/migrate.ts", import.meta.url))],
      {
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
        env: { PATH: process.env.PATH, DATABASE_URL: db.current.url },
      },
    );
    expect(stdout).toContain("Migrations applied.");
  });
});
