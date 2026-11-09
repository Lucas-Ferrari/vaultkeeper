import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_OUT, parseCliArgs, USAGE } from "../src/cli-args";

describe("catalog:generate arguments (task 3.10)", () => {
  const cwd = "/work/here";

  it("--openmu is required; paths resolve against the caller's directory", () => {
    expect(parseCliArgs(["--openmu", "../OpenMU"], cwd)).toEqual({
      openmu: resolve(cwd, "../OpenMU"),
      out: DEFAULT_OUT,
      commit: undefined,
    });
  });

  it("accepts --out and --commit", () => {
    const sha = "cb52cd658c5d49aacca6ee9bb1cbb9e011685ce2";
    expect(parseCliArgs(["--openmu", "/o", "--out", "seed.json", "--commit", sha], cwd)).toEqual({
      openmu: "/o",
      out: join(cwd, "seed.json"),
      commit: sha,
    });
  });

  it.each([[[]], [["--openmu"]], [["--bogus", "x"]], [["--openmu", "/o", "--commit", "abc"]]])(
    "usage error for %j",
    (argv) => {
      expect(() => parseCliArgs(argv, cwd)).toThrow(USAGE);
    },
  );

  it("the default output is the committed seed file of the api", () => {
    expect(DEFAULT_OUT.endsWith(join("apps", "api", "seed", "catalog.openmu-s6.json"))).toBe(true);
  });
});
