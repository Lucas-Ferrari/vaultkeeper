import { describe, expect, it } from "vitest";
import { offsetPage } from "./pagination";

describe("offsetPage", () => {
  it("wraps items with total, limit and offset", () => {
    expect(offsetPage(["a", "b"], 12, { limit: 2, offset: 4 })).toEqual({
      items: ["a", "b"],
      total: 12,
      limit: 2,
      offset: 4,
      hasMore: true,
    });
  });

  it("hasMore is false on the last page", () => {
    expect(offsetPage(["a"], 5, { limit: 2, offset: 4 }).hasMore).toBe(false);
    expect(offsetPage([], 0, { limit: 20, offset: 0 }).hasMore).toBe(false);
  });
});
