import { describe, expect, it } from "vitest";
import {
  createStockEntryInput,
  moveStockEntryInput,
  stockListQuery,
  updateStockEntryInput,
} from "./stock";

const base = {
  catalogItemId: "0f8e2d64-5b3a-4c1e-8f7d-6a9b2c3d4e51",
  storageLocationId: "a1c2e3f4-0b9d-4e8c-9a7b-5d6c4e3f2a10",
};

describe("createStockEntryInput (R-STK-1)", () => {
  it("S1: accepts a full entry", () => {
    const parsed = createStockEntryInput.parse({
      ...base,
      quantity: 1,
      level: 13,
      options: "+Luck, Exc: Dmg+2%",
    });
    expect(parsed).toMatchObject({ quantity: 1, level: 13, options: "+Luck, Exc: Dmg+2%" });
  });

  it("S2: quantity 0, -1, 1.5 and 10000 are rejected; omitted is 1", () => {
    for (const quantity of [0, -1, 1.5, 10_000]) {
      expect(createStockEntryInput.safeParse({ ...base, quantity }).success).toBe(false);
    }
    expect(createStockEntryInput.parse(base).quantity).toBe(1);
    expect(createStockEntryInput.parse({ ...base, quantity: 9999 }).quantity).toBe(9999);
  });

  it("S3: level 16 or -1 rejected; omitted is 0", () => {
    expect(createStockEntryInput.safeParse({ ...base, level: 16 }).success).toBe(false);
    expect(createStockEntryInput.safeParse({ ...base, level: -1 }).success).toBe(false);
    expect(createStockEntryInput.parse(base).level).toBe(0);
  });

  it("S4: options or notes over 500 chars rejected (spec wins over design 21's 1000)", () => {
    expect(createStockEntryInput.safeParse({ ...base, options: "x".repeat(501) }).success).toBe(
      false,
    );
    expect(createStockEntryInput.safeParse({ ...base, notes: "x".repeat(501) }).success).toBe(
      false,
    );
    expect(createStockEntryInput.parse({ ...base, notes: "x".repeat(500) }).notes).toHaveLength(
      500,
    );
  });

  it("S5: negative price rejected; omitted stays undefined, null allowed", () => {
    expect(createStockEntryInput.safeParse({ ...base, priceMc: "-1" }).success).toBe(false);
    expect(createStockEntryInput.parse(base).priceMc).toBeUndefined();
    expect(createStockEntryInput.parse({ ...base, priceMc: null }).priceMc).toBeNull();
    expect(createStockEntryInput.parse({ ...base, priceMc: "12.50" }).priceMc).toBe("12.50");
  });

  it("requires uuids for item and location", () => {
    expect(createStockEntryInput.safeParse({ ...base, catalogItemId: "x" }).success).toBe(false);
    expect(createStockEntryInput.safeParse({ catalogItemId: base.catalogItemId }).success).toBe(
      false,
    );
  });
});

describe("updateStockEntryInput (R-STK-2)", () => {
  it("omits storageLocationId (moves go through /move) and applies no defaults", () => {
    const parsed = updateStockEntryInput.parse({
      quantity: 3,
      storageLocationId: base.catalogItemId,
    });
    expect(parsed).toEqual({ quantity: 3 });
  });

  it("needs at least one field and keeps the same bounds", () => {
    expect(updateStockEntryInput.safeParse({}).success).toBe(false);
    expect(updateStockEntryInput.safeParse({ level: 16 }).success).toBe(false);
    expect(updateStockEntryInput.parse({ priceMc: null })).toEqual({ priceMc: null });
  });
});

describe("moveStockEntryInput", () => {
  it("needs a location uuid", () => {
    expect(moveStockEntryInput.safeParse({}).success).toBe(false);
    expect(moveStockEntryInput.parse({ storageLocationId: base.storageLocationId })).toEqual({
      storageLocationId: base.storageLocationId,
    });
  });
});

describe("stockListQuery (R-STK-4)", () => {
  it("coerces limit and keeps optional filters", () => {
    const accountId = "5e4d3c2b-1a09-4f8e-8d7c-6b5a49382716";
    expect(stockListQuery.parse({ accountId, limit: "5", q: " storm " })).toEqual({
      accountId,
      limit: 5,
      q: "storm",
    });
    expect(stockListQuery.parse({}).limit).toBe(20);
  });

  it("rejects malformed ids and limits", () => {
    expect(stockListQuery.safeParse({ groupId: "nope" }).success).toBe(false);
    expect(stockListQuery.safeParse({ limit: "51" }).success).toBe(false);
  });
});
