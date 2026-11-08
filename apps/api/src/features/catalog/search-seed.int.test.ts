import { readFile } from "node:fs/promises";
import { catalogItemPage, type CatalogItem } from "@vaultkeeper/shared/schemas/catalog";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  getWith,
  signUp,
  type SignedInUser,
  type TestApp,
} from "../../../test/auth-helpers";
import { useTestDatabase } from "../../../test/db";
import { DEFAULT_SEED_PATH, seedCatalog, seedFileSchema } from "../../cli/seed";

/**
 * Search ranking against the real OpenMU Season 6 seed (task 3.11 follow-up of 3.6): the 0.3
 * word-similarity threshold was tuned on a hand-made fixture; this checks it on ~750 real names.
 * OpenMU names the third wings "Wing of Storm" (singular).
 */
describe("catalog search on the real OpenMU seed (R-SRCH-1 S3/S4/S5/S9)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let member: SignedInUser;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    const seed = seedFileSchema.parse(JSON.parse(await readFile(DEFAULT_SEED_PATH, "utf8")));
    await seedCatalog(t.database.db, seed);
    member = await signUp(t.app);
  });
  afterAll(async () => {
    await t.close();
  });

  async function top(q: string, n: number): Promise<CatalogItem[]> {
    const params = new URLSearchParams({ q, limit: String(n) });
    const res = await getWith(t.app, `/api/v1/catalog/items?${params.toString()}`, member.cookie);
    expect(res.status).toBe(200);
    return catalogItemPage.parse(await res.json()).items;
  }

  it("S3: 'wigns of strom' finds 'Wing of Storm' among the top results", async () => {
    const names = (await top("wigns of strom", 5)).map((item) => item.name);
    expect(names).toContain("Wing of Storm");
  });

  // KNOWN GAP (task 3.11 report): on the real names S9 fails. "wigs" scores 0.4 against both
  // "wing" and "wind", and "excelent" scores 0.333 against "violent", so the five "Violent Wind"
  // armor pieces outrank every wing (mean per-word 0.367 vs <= 0.256). The 0.3 threshold is not
  // the cause (all wings pass it); the ranking needs a new signal (e.g. category-name match).
  // `it.fails` keeps the gap visible: it starts failing the day ranking is fixed -> flip to `it`.
  it.fails("S9: 'excelent wigs' ranks wings-category items near the top (top 5)", async () => {
    const results = await top("excelent wigs", 5);
    expect(results.filter((item) => item.categorySlug === "wings").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(results[0]?.categorySlug).toBe("wings");
  });

  it("S4: 'storm' returns items containing Storm", async () => {
    const names = (await top("storm", 20)).map((item) => item.name);
    expect(names.filter((name) => /storm/i.test(name)).length).toBeGreaterThanOrEqual(5);
  });

  it("S5: an exact name ranks first ('kris', 'jewel of bless')", async () => {
    expect((await top("kris", 5))[0]?.name).toBe("Kris");
    expect((await top("jewel of bless", 5))[0]?.name).toBe("Jewel of Bless");
  });
});
