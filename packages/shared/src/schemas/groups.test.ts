import { describe, expect, it } from "vitest";
import {
  addGroupEntriesInput,
  createGroupInput,
  replaceGroupEntriesInput,
  updateGroupInput,
} from "./groups";

const ID = "0f8e2d64-5b3a-4c1e-8f7d-6a9b2c3d4e51";

describe("createGroupInput (R-GRP-1)", () => {
  it("trims the name and accepts 1..60 chars", () => {
    expect(createGroupInput.parse({ name: "  Dark Phoenix Set " }).name).toBe("Dark Phoenix Set");
    expect(createGroupInput.safeParse({ name: "x".repeat(60) }).success).toBe(true);
  });

  it("rejects an empty / blank or 61-char name", () => {
    for (const name of ["", "   ", "x".repeat(61)]) {
      expect(createGroupInput.safeParse({ name }).success).toBe(false);
    }
  });

  it("description is optional, nullable and at most 500 chars", () => {
    expect(createGroupInput.parse({ name: "G" }).description).toBeUndefined();
    expect(createGroupInput.parse({ name: "G", description: null }).description).toBeNull();
    expect(createGroupInput.safeParse({ name: "G", description: "x".repeat(500) }).success).toBe(
      true,
    );
    expect(createGroupInput.safeParse({ name: "G", description: "x".repeat(501) }).success).toBe(
      false,
    );
  });
});

describe("updateGroupInput", () => {
  it("needs at least one field", () => {
    expect(updateGroupInput.safeParse({}).success).toBe(false);
    expect(updateGroupInput.parse({ name: "Trade" })).toEqual({ name: "Trade" });
  });
});

describe("group entries inputs (R-GRP-2)", () => {
  it("POST needs 1+ uuids; PUT allows an empty set", () => {
    expect(addGroupEntriesInput.safeParse({ stockEntryIds: [] }).success).toBe(false);
    expect(addGroupEntriesInput.parse({ stockEntryIds: [ID] }).stockEntryIds).toEqual([ID]);
    expect(replaceGroupEntriesInput.parse({ stockEntryIds: [] }).stockEntryIds).toEqual([]);
    expect(addGroupEntriesInput.safeParse({ stockEntryIds: ["nope"] }).success).toBe(false);
  });

  it("caps a bulk request at 500 ids", () => {
    const ids = Array.from({ length: 501 }, () => ID);
    expect(addGroupEntriesInput.safeParse({ stockEntryIds: ids }).success).toBe(false);
  });
});
