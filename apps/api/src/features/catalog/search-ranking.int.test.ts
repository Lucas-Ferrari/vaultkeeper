import { catalogItemPage, type CatalogItem } from "@vaultkeeper/shared/schemas/catalog";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  getWith,
  signUp,
  type SignedInUser,
  type TestApp,
} from "../../../test/auth-helpers";
import {
  insertCategories,
  insertItems,
  SEARCH_CATEGORIES,
  SEARCH_ITEMS,
} from "../../../test/catalog-fixtures";
import { useTestDatabase } from "../../../test/db";

describe("catalog search ranking + typos (task 3.6, R-SRCH-1)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let member: SignedInUser;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    await insertCategories(t.database.pool, SEARCH_CATEGORIES);
    await insertItems(t.database.pool, SEARCH_ITEMS);
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

  it("finds 'Wings of Storm' first for the typo 'wigns of strom' (S3)", async () => {
    const results = await top("wigns of strom", 3);
    expect(results[0]?.name).toBe("Wings of Storm");
  });

  it("ranks the exact name first: 'destruction' -> 'Destruction' (S5)", async () => {
    const names = (await top("destruction", 5)).map((item) => item.name);
    expect(names[0]).toBe("Destruction");
    expect(names).toEqual(expect.arrayContaining(["Sword of Destruction", "Axe of Destruction"]));
  });

  it("exact match wins regardless of case/accents", async () => {
    expect((await top("DESTRUCTIÓN", 1))[0]?.name).toBe("Destruction");
  });

  it("'excelent wigs' puts wings near the top (S9: top 5, mostly wings, wings first)", async () => {
    const results = await top("excelent wigs", 5);
    expect(results).toHaveLength(5);
    expect(results[0]?.categorySlug).toBe("wings");
    const wings = results.filter((item) => item.categorySlug === "wings");
    expect(wings.length).toBeGreaterThanOrEqual(3);
  });

  it("short filler words do not drag in unrelated items ('of' alone is not a match)", async () => {
    const names = (await top("of strom", 10)).map((item) => item.name);
    expect(names[0]).toBe("Wings of Storm");
    expect(names).not.toContain("Cape of Lord");
  });
});
