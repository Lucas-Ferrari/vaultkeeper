import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { CATALOG_SOURCE } from "@vaultkeeper/shared/constants";
import {
  catalogItemName,
  categorySlug,
  createCategoryInput,
} from "@vaultkeeper/shared/schemas/catalog";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client";
import { EXIT, type CliIo, type ExitCode } from "./io";

export const SEED_USAGE = "seed [--file <seed.json>]";

/** The committed OpenMU Season 6 seed (task 3.10), next to src/ and dist/ alike. */
export const DEFAULT_SEED_PATH = resolve(import.meta.dirname, "../../seed/catalog.openmu-s6.json");

const seedItem = z.object({
  externalKey: z.string().regex(/^openmu:s6:\d+:\d+$/),
  category: categorySlug,
  name: catalogItemName,
});

/** apps/api/seed/catalog.openmu-s6.json, as written by `pnpm catalog:generate`. */
export const seedFileSchema = z
  .object({
    source: z.literal(CATALOG_SOURCE.OPENMU),
    season: z.literal("s6"),
    openmuRepository: z.url(),
    openmuCommit: z.string().regex(/^[0-9a-f]{40}$/),
    license: z.string().min(1),
    categories: z.array(createCategoryInput.required()),
    items: z.array(seedItem),
  })
  .superRefine((seed, ctx) => {
    const slugs = new Set(seed.categories.map((category) => category.slug));
    seed.items.forEach((item, index) => {
      if (!slugs.has(item.category)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "category"],
          message: `unknown category ${item.category}`,
        });
      }
    });
  });
export type SeedFile = z.infer<typeof seedFileSchema>;

export interface SeedReport {
  categoriesInserted: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** Seed keys not imported: an admin/CSV item already uses that name in that category. */
  skipped: string[];
}

/**
 * Idempotent catalog seed (R-CAT-4, design 10, ADR11), one transaction:
 * - categories: inserted when missing; existing ones keep their admin-edited display data;
 * - items: upsert by external_key. Only rows the seeder owns (source 'openmu') get the seed's
 *   name/category; price, image and is_active are never written, and admin/CSV rows are never
 *   touched. A seed item whose name an admin/CSV row already uses in its category is skipped.
 */
export async function seedCatalog(db: DbOrTx, seed: SeedFile): Promise<SeedReport> {
  const categories = JSON.stringify(
    seed.categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      icon: category.icon,
      sort_order: category.sortOrder,
    })),
  );
  const items = JSON.stringify(
    seed.items.map((item) => ({
      external_key: item.externalKey,
      category: item.category,
      name: item.name,
    })),
  );
  const seedRows = sql`jsonb_to_recordset(${items}::jsonb) AS r(external_key text, category text, name text)`;
  const takenByOther = sql`EXISTS (
    SELECT 1 FROM catalog_items c
    WHERE c.category_slug = r.category
      AND c.search_name = public.immutable_unaccent(lower(r.name))
      AND c.external_key IS DISTINCT FROM r.external_key
  )`;

  return db.transaction(async (tx) => {
    const insertedCategories = await tx.execute<{ slug: string }>(sql`
      INSERT INTO item_categories (slug, name, icon, sort_order)
      SELECT slug, name, icon, sort_order
      FROM jsonb_to_recordset(${categories}::jsonb) AS c(slug text, name text, icon text, sort_order int)
      ON CONFLICT (slug) DO NOTHING
      RETURNING slug`);

    const skipped = await tx.execute<{ external_key: string }>(
      sql`SELECT r.external_key FROM ${seedRows} WHERE ${takenByOther} ORDER BY r.external_key`,
    );

    const written = await tx.execute<{ inserted: boolean }>(sql`
      INSERT INTO catalog_items (external_key, category_slug, name, source)
      SELECT r.external_key, r.category, r.name, ${CATALOG_SOURCE.OPENMU}
      FROM ${seedRows}
      WHERE NOT ${takenByOther}
      ON CONFLICT (external_key) DO UPDATE
        SET name = EXCLUDED.name, category_slug = EXCLUDED.category_slug, updated_at = now()
        WHERE catalog_items.source = ${CATALOG_SOURCE.OPENMU}
          AND (catalog_items.name, catalog_items.category_slug)
            IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.category_slug)
      RETURNING (xmax = 0) AS inserted`);

    const inserted = written.rows.filter((row) => row.inserted).length;
    const updated = written.rows.length - inserted;
    return {
      categoriesInserted: insertedCategories.rows.length,
      inserted,
      updated,
      unchanged: seed.items.length - inserted - updated - skipped.rows.length,
      skipped: skipped.rows.map((row) => row.external_key),
    };
  });
}

export interface SeedDeps {
  db: DbOrTx;
  io: CliIo;
}

async function loadSeed(path: string): Promise<SeedFile> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (cause) {
    throw new Error(`Cannot read seed file ${path}`, { cause });
  }
  const parsed = seedFileSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(`Invalid seed file ${path}: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** `cli seed [--file <path>]`: deploy runs migrate -> seed (design 10). Safe to re-run. */
export async function run(args: readonly string[], { db, io }: SeedDeps): Promise<ExitCode> {
  let file: string | undefined;
  try {
    ({
      values: { file },
    } = parseArgs({ args: [...args], options: { file: { type: "string" } }, strict: true }));
  } catch {
    io.err(`Usage: ${SEED_USAGE}`);
    return EXIT.FAILURE;
  }

  const path = file ?? DEFAULT_SEED_PATH;
  let seed: SeedFile;
  try {
    seed = await loadSeed(path);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return EXIT.FAILURE;
  }

  const report = await seedCatalog(db, seed);
  io.out(
    `seeded catalog from OpenMU ${seed.openmuCommit}: ${report.inserted} inserted, ` +
      `${report.updated} updated, ${report.unchanged} unchanged, ${report.skipped.length} skipped; ` +
      `${report.categoriesInserted} new categories.`,
  );
  for (const key of report.skipped) {
    io.err(`skipped ${key}: an admin or CSV item already uses its name in that category`);
  }
  return EXIT.OK;
}
