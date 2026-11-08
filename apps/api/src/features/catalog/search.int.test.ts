import { catalogItemPage, type CatalogItemPage } from "@vaultkeeper/shared/schemas/catalog";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  getWith,
  signUp,
  signUpAdmin,
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

const ITEMS = "/api/v1/catalog/items";
const ADMIN_ITEMS = "/api/v1/admin/catalog/items";
/** 100 extra "Tempest Shard NNN" items for the default-limit scenario (S8). */
const SHARD_COUNT = 100;

describe("catalog search basics (task 3.5, R-SRCH-1/2)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let admin: SignedInUser;
  let member: SignedInUser;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    await insertCategories(t.database.pool, [
      ...SEARCH_CATEGORIES,
      { slug: "jewels", name: "Jewels", icon: "jewel" },
    ]);
    await insertItems(t.database.pool, SEARCH_ITEMS);
    await insertItems(
      t.database.pool,
      Array.from({ length: SHARD_COUNT }, (_, index) => ({
        categorySlug: "jewels",
        name: `Tempest Shard ${String(index + 1).padStart(3, "0")}`,
      })),
    );
    admin = await signUpAdmin(t);
    member = await signUp(t.app);
  });
  afterAll(async () => {
    await t.close();
  });

  async function search(query: Record<string, string>, path = ITEMS): Promise<CatalogItemPage> {
    const cookie = path === ITEMS ? member.cookie : admin.cookie;
    const res = await getWith(t.app, `${path}?${new URLSearchParams(query).toString()}`, cookie);
    expect(res.status, await res.clone().text()).toBe(200);
    return catalogItemPage.parse(await res.json());
  }

  const names = (page: CatalogItemPage) => page.items.map((item) => item.name);

  it("ignores accents (S1)", async () => {
    expect(names(await search({ q: "espada ignea" }))[0]).toBe("Espada Ígnea");
    expect(names(await search({ q: "ESPADA ÍGNEA" }))[0]).toBe("Espada Ígnea");
  });

  it("ignores case (S2)", async () => {
    expect(names(await search({ q: "WINGS OF STORM" }))[0]).toBe("Wings of Storm");
  });

  it("matches partial names (S4)", async () => {
    const found = names(await search({ q: "storm", limit: "50" }));
    expect(found).toEqual(
      expect.arrayContaining(["Wings of Storm", "Storm Crow Armor", "Storm Crow Helm"]),
    );
  });

  it("no match -> 200 with an empty page, not an error (S6)", async () => {
    const page = await search({ q: "zzzzqqq" });
    expect(page).toEqual({ items: [], total: 0, limit: 20, offset: 0, hasMore: false });
  });

  it("treats LIKE wildcards in q literally (% and _ are escaped)", async () => {
    expect((await search({ q: "%%" })).items).toEqual([]);
    expect((await search({ q: "__" })).items).toEqual([]);
    expect((await search({ q: "%_%" })).items).toEqual([]);
  });

  describe("short queries browse instead of fuzzy matching (S7)", () => {
    it("q of 1 char -> name-prefix browse ordered by name, limit applies", async () => {
      const page = await search({ q: "w", limit: "5" });
      expect(page.items).toHaveLength(5);
      expect(names(page).every((name) => name.toLowerCase().startsWith("w"))).toBe(true);
      expect(names(page)).toEqual(
        [...names(page)].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
      );
      expect(page.total).toBeGreaterThan(5);
    });

    it("blank q -> browse by name with the default limit (never a full dump)", async () => {
      const page = await search({ q: "   " });
      expect(page.items).toHaveLength(20);
      expect(page.hasMore).toBe(true);
    });

    it("blank q + category -> category browse", async () => {
      const page = await search({ category: "helms" });
      expect(names(page)).toEqual(["Storm Crow Helm"]);
    });
  });

  it("returns 20 by default out of 100+ matches, with the true total (S8)", async () => {
    const page = await search({ q: "tempest shard" });
    expect(page.items).toHaveLength(20);
    expect(names(page).every((name) => name.startsWith("Tempest Shard"))).toBe(true);
    expect(page.total).toBeGreaterThanOrEqual(SHARD_COUNT);
    expect(page.hasMore).toBe(true);
    const next = await search({ q: "tempest shard", offset: "20" });
    expect(next.items).toHaveLength(20);
    expect(names(next)).not.toContain(names(page)[0]);
    expect(next.total).toBe(page.total);
  });

  it("paging past the last match still reports the true total (window count fallback)", async () => {
    const first = await search({ q: "tempest shard" });
    const past = await search({ q: "tempest shard", offset: "5000" });
    expect(past.items).toEqual([]);
    expect(past.total).toBe(first.total);
    expect(past.hasMore).toBe(false);
  });

  it("a user never sees inactive matches; admin with includeInactive does (R-SRCH-2 S1)", async () => {
    expect(names(await search({ q: "wings of storm", limit: "50" }))).not.toContain(
      "Wings of Storm Inactive",
    );
    expect(names(await search({ q: "wings of storm", limit: "50" }, ADMIN_ITEMS))).not.toContain(
      "Wings of Storm Inactive",
    );
    expect(
      names(
        await search({ q: "wings of storm", limit: "50", includeInactive: "true" }, ADMIN_ITEMS),
      ),
    ).toContain("Wings of Storm Inactive");
  });

  it("filters by category (R-SRCH-2 S2)", async () => {
    const page = await search({ q: "storm", category: "wings", limit: "50" });
    expect(names(page)).toContain("Wings of Storm");
    expect(page.items.every((item) => item.categorySlug === "wings")).toBe(true);
  });
});
