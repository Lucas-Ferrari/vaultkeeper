import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath (no open redirect after sign-in)", () => {
  it.each(["/", "/stock", "/stock?q=wings#top", "/accounts/123/locations/9"])(
    "keeps the in-app path %s",
    (path) => {
      expect(safeRedirectPath(path)).toBe(path);
    },
  );

  it.each([
    undefined,
    "",
    "stock",
    "//evil.example/x",
    "/\\evil.example",
    "https://evil.example/",
    "javascript:alert(1)",
    "/login",
    "/login?redirect=%2F",
    "/register",
  ])("falls back to / for %j", (path) => {
    expect(safeRedirectPath(path)).toBe("/");
  });
});
