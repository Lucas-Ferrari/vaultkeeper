import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseHandle } from "../db/client";
import { memoryIo } from "../../test/cli-io";
import { useTestDatabase } from "../../test/db";
import { EXIT } from "./io";
import { DEFAULT_SEED_PATH, run as seed, seedCatalog, seedFileSchema, type SeedFile } from "./seed";

/** Catalog seeder (task 3.11, R-CAT-4 S1-S4, design 10, ADR11). */
describe("seed CLI", () => {
  const db = useTestDatabase();
  let handle: DatabaseHandle;
  let realSeed: SeedFile;

  beforeAll(async () => {
    handle = createDatabase(db.current.url);
    realSeed = seedFileSchema.parse(JSON.parse(await readFile(DEFAULT_SEED_PATH, "utf8")));
  });
  afterAll(async () => {
    await handle.close();
  });
  beforeEach(async () => {
    await handle.pool.query("TRUNCATE catalog_items, item_categories CASCADE");
  });

  const deps = (io = memoryIo()) => ({ db: handle.db, io });

  async function itemCount(): Promise<number> {
    const { rows } = await handle.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM catalog_items",
    );
    return rows[0]?.n ?? 0;
  }

  interface ItemState {
    name: string;
    category_slug: string;
    source: string;
    is_active: boolean;
    reference_price_mc: string | null;
    image_key: string | null;
  }

  async function byKey(externalKey: string): Promise<ItemState | undefined> {
    const { rows } = await handle.pool.query<ItemState>(
      `SELECT name, category_slug, source, is_active, reference_price_mc, image_key
       FROM catalog_items WHERE external_key = $1`,
      [externalKey],
    );
    return rows[0];
  }

  function tinySeed(items: SeedFile["items"]): SeedFile {
    return {
      ...realSeed,
      categories: [
        { slug: "swords", name: "Swords", icon: "sword", sortOrder: 10 },
        { slug: "wings", name: "Wings & Capes", icon: "wings", sortOrder: 130 },
      ],
      items,
    };
  }

  it("the committed seed file is valid, OpenMU-sourced, pinned to a commit and image-free", () => {
    expect(realSeed.source).toBe("openmu");
    expect(realSeed.openmuCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(realSeed.items.length).toBeGreaterThan(500);
    expect(JSON.stringify(realSeed)).not.toMatch(/image/i);
  });

  it("S1: empty catalog -> every seed item exists, active, unpriced, source openmu", async () => {
    const io = memoryIo();

    const code = await seed([], deps(io));

    expect(code).toBe(EXIT.OK);
    expect(await itemCount()).toBe(realSeed.items.length);
    const { rows } = await handle.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM catalog_items
       WHERE source = 'openmu' AND is_active AND reference_price_mc IS NULL AND image_key IS NULL`,
    );
    expect(rows[0]?.n).toBe(realSeed.items.length);
    const categories = await handle.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM item_categories",
    );
    expect(categories.rows[0]?.n).toBe(realSeed.categories.length);
    expect(io.stdout.join("\n")).toContain(`${realSeed.items.length} inserted`);
  });

  it("S2: running twice keeps the count and creates no duplicates", async () => {
    await seed([], deps());
    const io = memoryIo();

    const code = await seed([], deps(io));

    expect(code).toBe(EXIT.OK);
    expect(await itemCount()).toBe(realSeed.items.length);
    const { rows } = await handle.pool.query<{ n: number }>(
      "SELECT count(DISTINCT external_key)::int AS n FROM catalog_items",
    );
    expect(rows[0]?.n).toBe(realSeed.items.length);
    expect(io.stdout.join("\n")).toContain("0 inserted, 0 updated");
  });

  it("S3: admin price/image/is_active survive a re-run, even when the seed renames the item", async () => {
    const key = "openmu:s6:0:0";
    await seedCatalog(
      handle.db,
      tinySeed([{ externalKey: key, category: "swords", name: "Kris" }]),
    );
    await handle.pool.query(
      `UPDATE catalog_items SET reference_price_mc = 12.5, image_key = 'items/ab/abcd.webp', is_active = false
       WHERE external_key = $1`,
      [key],
    );

    const report = await seedCatalog(
      handle.db,
      tinySeed([{ externalKey: key, category: "swords", name: "Kris Dagger" }]),
    );

    expect(report).toMatchObject({ inserted: 0, updated: 1 });
    expect(await byKey(key)).toEqual({
      name: "Kris Dagger",
      category_slug: "swords",
      source: "openmu",
      is_active: false,
      reference_price_mc: "12.50",
      image_key: "items/ab/abcd.webp",
    });
  });

  it("S4: admin- and CSV-created rows are untouched, even one that took an OpenMU key", async () => {
    await seedCatalog(handle.db, tinySeed([]));
    await handle.pool.query(
      `INSERT INTO catalog_items (category_slug, name, source, external_key, reference_price_mc)
       VALUES ('wings', 'Wings of Storm (S7)', 'admin', NULL, 100),
              ('swords', 'Custom Kris', 'csv', 'openmu:s6:0:0', 5)`,
    );

    const report = await seedCatalog(
      handle.db,
      tinySeed([
        { externalKey: "openmu:s6:0:0", category: "swords", name: "Kris" },
        { externalKey: "openmu:s6:12:0", category: "wings", name: "Wings of Elf" },
      ]),
    );

    expect(report).toMatchObject({ inserted: 1, updated: 0 });
    expect(await byKey("openmu:s6:0:0")).toMatchObject({
      name: "Custom Kris",
      source: "csv",
      reference_price_mc: "5.00",
    });
    const { rows } = await handle.pool.query<{ name: string; source: string }>(
      "SELECT name, source FROM catalog_items WHERE external_key IS NULL",
    );
    expect(rows).toEqual([{ name: "Wings of Storm (S7)", source: "admin" }]);
  });

  it("skips (and reports) a seed item whose name an admin item already uses in that category", async () => {
    await seedCatalog(handle.db, tinySeed([]));
    await handle.pool.query(
      "INSERT INTO catalog_items (category_slug, name, source) VALUES ('swords', 'KRIS', 'admin')",
    );

    const report = await seedCatalog(
      handle.db,
      tinySeed([{ externalKey: "openmu:s6:0:0", category: "swords", name: "Kris" }]),
    );

    expect(report).toMatchObject({ inserted: 0, skipped: ["openmu:s6:0:0"] });
    expect(await byKey("openmu:s6:0:0")).toBeUndefined();
  });

  it("keeps admin-edited category display data", async () => {
    await seedCatalog(handle.db, tinySeed([]));
    await handle.pool.query(
      "UPDATE item_categories SET name = 'Blades', sort_order = 1 WHERE slug = 'swords'",
    );

    await seedCatalog(handle.db, tinySeed([]));

    const { rows } = await handle.pool.query<{ name: string; sort_order: number }>(
      "SELECT name, sort_order FROM item_categories WHERE slug = 'swords'",
    );
    expect(rows[0]).toEqual({ name: "Blades", sort_order: 1 });
  });

  it("an invalid seed file -> exit 1, nothing written", async () => {
    const io = memoryIo();

    const code = await seed(["--file", "/nonexistent/seed.json"], deps(io));

    expect(code).toBe(EXIT.FAILURE);
    expect(io.stderr.join("\n")).toMatch(/seed file/i);
    expect(await itemCount()).toBe(0);
  });

  it("usage error for unknown args -> exit 1", async () => {
    const io = memoryIo();
    expect(await seed(["--bogus"], deps(io))).toBe(EXIT.FAILURE);
    expect(io.stderr.join("\n")).toMatch(/usage: seed/i);
  });
});
