import { describe, expect, it } from "vitest";
import {
  adminCatalogSearchQuery,
  catalogItem,
  catalogItemName,
  catalogSearchQuery,
  categorySlug,
  createCatalogItemInput,
  createCategoryInput,
  updateCatalogItemInput,
  updateCategoryInput,
} from "./catalog";

describe("catalogItemName (R-CAT-1: 1..120 chars, trimmed)", () => {
  it("trims surrounding whitespace", () => {
    expect(catalogItemName.parse("  Wings of Storm  ")).toBe("Wings of Storm");
  });

  it("accepts 1 and 120 chars, keeps accents", () => {
    expect(catalogItemName.parse("x")).toBe("x");
    expect(catalogItemName.parse("a".repeat(120))).toHaveLength(120);
    expect(catalogItemName.parse("Espada Ígnea")).toBe("Espada Ígnea");
  });

  it.each(["", "   ", "a".repeat(121)])("rejects %j", (value) => {
    expect(catalogItemName.safeParse(value).success).toBe(false);
  });

  it("checks the length AFTER trimming (121 chars padded by spaces is still too long)", () => {
    expect(catalogItemName.parse(` ${"a".repeat(120)} `)).toHaveLength(120);
    expect(catalogItemName.safeParse(` ${"a".repeat(121)} `).success).toBe(false);
  });
});

describe("categorySlug (^[a-z0-9-]+$)", () => {
  it.each(["wings", "swords", "pet-items", "box-of-kundun-5"])("accepts %s", (value) => {
    expect(categorySlug.parse(value)).toBe(value);
  });

  it.each(["", "Wings", "pet items", "pet_items", "wíngs", "a/b", "x".repeat(41)])(
    "rejects %j",
    (value) => {
      expect(categorySlug.safeParse(value).success).toBe(false);
    },
  );
});

describe("createCatalogItemInput (R-CAT-1 S1/S4)", () => {
  it("defaults to no price and leaves isActive to the DB default", () => {
    expect(
      createCatalogItemInput.parse({ categorySlug: "wings", name: " Wings of Storm " }),
    ).toEqual({ categorySlug: "wings", name: "Wings of Storm" });
  });

  it("accepts a decimal-string price and an explicit null", () => {
    expect(
      createCatalogItemInput.parse({ categorySlug: "wings", name: "W", referencePriceMc: "1500.5" })
        .referencePriceMc,
    ).toBe("1500.5");
    expect(
      createCatalogItemInput.parse({ categorySlug: "wings", name: "W", referencePriceMc: null })
        .referencePriceMc,
    ).toBeNull();
  });

  it("reports a field error for each invalid field (S4)", () => {
    const result = createCatalogItemInput.safeParse({
      categorySlug: "Not A Slug",
      name: "",
      referencePriceMc: "-1",
    });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["categorySlug", "name", "referencePriceMc"]));
  });

  it.each(["-1", "abc", "1.234"])("rejects price %j", (price) => {
    expect(
      createCatalogItemInput.safeParse({ categorySlug: "w", name: "W", referencePriceMc: price })
        .success,
    ).toBe(false);
  });

  it("rejects a float price: money travels as strings (ADR3)", () => {
    expect(
      createCatalogItemInput.safeParse({ categorySlug: "w", name: "W", referencePriceMc: 1500.5 })
        .success,
    ).toBe(false);
  });
});

describe("updateCatalogItemInput (R-CAT-2: edit any field)", () => {
  it("accepts any single field, including price null and isActive", () => {
    expect(updateCatalogItemInput.parse({ name: " New " })).toEqual({ name: "New" });
    expect(updateCatalogItemInput.parse({ referencePriceMc: null })).toEqual({
      referencePriceMc: null,
    });
    expect(updateCatalogItemInput.parse({ isActive: false })).toEqual({ isActive: false });
    expect(updateCatalogItemInput.parse({ categorySlug: "swords" })).toEqual({
      categorySlug: "swords",
    });
  });

  it("rejects an empty patch", () => {
    expect(updateCatalogItemInput.safeParse({}).success).toBe(false);
  });

  it("validates fields like create", () => {
    expect(updateCatalogItemInput.safeParse({ name: "" }).success).toBe(false);
    expect(updateCatalogItemInput.safeParse({ referencePriceMc: "-5" }).success).toBe(false);
  });
});

describe("category inputs", () => {
  it("create: slug + trimmed name + icon, sortOrder defaults to 0", () => {
    expect(createCategoryInput.parse({ slug: "wings", name: " Wings ", icon: "wings" })).toEqual({
      slug: "wings",
      name: "Wings",
      icon: "wings",
      sortOrder: 0,
    });
  });

  it("create: rejects a bad slug, empty name, negative or fractional sortOrder", () => {
    expect(createCategoryInput.safeParse({ slug: "Bad", name: "B", icon: "b" }).success).toBe(
      false,
    );
    expect(createCategoryInput.safeParse({ slug: "b", name: " ", icon: "b" }).success).toBe(false);
    expect(
      createCategoryInput.safeParse({ slug: "b", name: "B", icon: "b", sortOrder: -1 }).success,
    ).toBe(false);
    expect(
      createCategoryInput.safeParse({ slug: "b", name: "B", icon: "b", sortOrder: 1.5 }).success,
    ).toBe(false);
  });

  it("update: partial but not empty; the slug (PK) is not editable", () => {
    expect(updateCategoryInput.parse({ sortOrder: 3 })).toEqual({ sortOrder: 3 });
    expect(updateCategoryInput.safeParse({}).success).toBe(false);
    expect(updateCategoryInput.parse({ slug: "other", name: "N" })).toEqual({ name: "N" });
  });
});

describe("catalogSearchQuery (R-SRCH-1: q <= 80, limit default 20, max 50)", () => {
  it("defaults limit 20 / offset 0 and trims q", () => {
    expect(catalogSearchQuery.parse({ q: "  storm " })).toEqual({
      q: "storm",
      limit: 20,
      offset: 0,
    });
  });

  it("coerces query-string numbers and accepts limit 50", () => {
    expect(catalogSearchQuery.parse({ limit: "50", offset: "40", category: "wings" })).toEqual({
      limit: 50,
      offset: 40,
      category: "wings",
    });
  });

  it.each([{ limit: "51" }, { limit: "0" }, { offset: "-1" }, { q: "x".repeat(81) }])(
    "rejects %j",
    (query) => {
      expect(catalogSearchQuery.safeParse(query).success).toBe(false);
    },
  );

  it("accepts an 80-char q and rejects a bad category slug", () => {
    expect(catalogSearchQuery.safeParse({ q: "x".repeat(80) }).success).toBe(true);
    expect(catalogSearchQuery.safeParse({ category: "Not Slug" }).success).toBe(false);
  });
});

describe("adminCatalogSearchQuery (R-CAT-2 S2, R-SRCH-2 S1)", () => {
  it("parses includeInactive and active from query strings ('false' is false)", () => {
    expect(adminCatalogSearchQuery.parse({ includeInactive: "true", active: "false" })).toEqual({
      includeInactive: true,
      active: false,
      limit: 20,
      offset: 0,
    });
  });

  it("includeInactive defaults to false; active is optional", () => {
    expect(adminCatalogSearchQuery.parse({})).toEqual({
      includeInactive: false,
      limit: 20,
      offset: 0,
    });
  });

  it("rejects junk booleans", () => {
    expect(adminCatalogSearchQuery.safeParse({ active: "maybe" }).success).toBe(false);
  });
});

describe("catalogItem (response contract)", () => {
  it("parses a DB-shaped item with numeric(14,2) price string", () => {
    const item = {
      id: "6f1c2c9e-3f7a-4a51-9b51-2b1f1d2b9c11",
      categorySlug: "wings",
      name: "Wings of Storm",
      isActive: true,
      referencePriceMc: "1500.50",
      imageKey: null,
      source: "admin",
    };
    expect(catalogItem.parse(item)).toEqual(item);
  });

  it("rejects an unknown source", () => {
    expect(
      catalogItem.safeParse({
        id: "6f1c2c9e-3f7a-4a51-9b51-2b1f1d2b9c11",
        categorySlug: "wings",
        name: "W",
        isActive: true,
        referencePriceMc: null,
        imageKey: null,
        source: "scraped",
      }).success,
    ).toBe(false);
  });
});
