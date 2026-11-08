import { describe, expect, it } from "vitest";
import { PAGINATION, paginationQuery } from "./pagination";

describe("paginationQuery (query-string limit/offset, d21)", () => {
  it("defaults to limit 20, offset 0", () => {
    expect(paginationQuery.parse({})).toEqual({ limit: 20, offset: 0 });
    expect(PAGINATION).toEqual({ DEFAULT_LIMIT: 20, MAX_LIMIT: 50 });
  });

  it("coerces query-string values", () => {
    expect(paginationQuery.parse({ limit: "50", offset: "40" })).toEqual({ limit: 50, offset: 40 });
  });

  it.each([{ limit: "1" }, { limit: "50" }, { offset: "0" }, { offset: "100000" }])(
    "accepts %j",
    (query) => {
      expect(paginationQuery.safeParse(query).success).toBe(true);
    },
  );

  it.each([{ limit: "0" }, { limit: "51" }, { limit: "2.5" }, { limit: "x" }, { offset: "-1" }])(
    "rejects %j",
    (query) => {
      expect(paginationQuery.safeParse(query).success).toBe(false);
    },
  );
});
