import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ParsedItem } from "../src/cs-parser";
import { buildSeed, generateSeed, readGitCommit, serializeSeed } from "../src/generate";

const FIXTURES = join(import.meta.dirname, "fixtures");
const SHA = "cb52cd658c5d49aacca6ee9bb1cbb9e011685ce2";

const fixtureInput = {
  itemsDirectory: join(FIXTURES, "Items"),
  resxPath: join(FIXTURES, "ItemNames.resx"),
  openmuCommit: SHA,
  // The fixtures are 11.5% unparseable on purpose (cs-parser tests); the generator still enforces
  // the 2% default when called by the CLI.
  maxUnparsedRatio: 1,
};

function item(overrides: Partial<ParsedItem>): ParsedItem {
  return {
    group: 0,
    number: 0,
    name: "Kris",
    file: "Weapons.cs",
    source: "Weapons.cs",
    line: 1,
    ...overrides,
  };
}

describe("seed generator (task 3.10, R-CAT-4 S5, design 10 step 3)", () => {
  it("is deterministic: the same input twice gives byte-identical JSON", async () => {
    const first = serializeSeed((await generateSeed(fixtureInput)).seed);
    const second = serializeSeed((await generateSeed(fixtureInput)).seed);
    expect(first).toBe(second);
    expect(first.endsWith("}\n")).toBe(true);
  });

  it("records the OpenMU commit SHA and the source, and ships no images", async () => {
    const { seed } = await generateSeed(fixtureInput);
    expect(seed).toMatchObject({ source: "openmu", season: "s6", openmuCommit: SHA });
    expect(serializeSeed(seed)).not.toMatch(/image|icon\.png|\.jpg/i);
  });

  it("emits sorted items keyed openmu:s6:<group>:<number> with their category", async () => {
    const { seed } = await generateSeed(fixtureInput);
    expect(seed.items.slice(0, 3)).toEqual([
      { externalKey: "openmu:s6:0:0", category: "swords", name: "Kris" },
      { externalKey: "openmu:s6:0:1", category: "swords", name: "Short Sword" },
      { externalKey: "openmu:s6:5:0", category: "staffs", name: "Literal Staff" },
    ]);
    const keys = seed.items.map((entry) => entry.externalKey.split(":").slice(2).map(Number));
    const sorted = [...keys].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0));
    expect(keys).toEqual(sorted);
    expect(seed.items.find((entry) => entry.name === "Cape of Lord")).toEqual({
      externalKey: "openmu:s6:13:30",
      category: "wings",
      name: "Cape of Lord",
    });
  });

  it("lists every category used, with display data", async () => {
    const { seed } = await generateSeed(fixtureInput);
    const used = new Set(seed.items.map((entry) => entry.category));
    for (const slug of used) {
      expect(seed.categories.find((category) => category.slug === slug)).toBeDefined();
    }
    expect(seed.categories[0]).toEqual({
      slug: "swords",
      name: "Swords",
      icon: "sword",
      sortOrder: 10,
    });
  });

  it("dedupes the same item defined twice; keeps the first name when two differ (and reports it)", () => {
    const { seed, warnings } = buildSeed(
      [
        item({ name: "Kris" }),
        item({ name: "Kris", source: "Other.cs" }),
        item({ name: "Kriss", source: "Third.cs", line: 9 }),
      ],
      SHA,
    );
    expect(seed.items).toEqual([
      { externalKey: "openmu:s6:0:0", category: "swords", name: "Kris" },
    ]);
    expect(warnings).toEqual([expect.stringMatching(/openmu:s6:0:0.*"Kriss".*Third\.cs:9/)]);
  });

  it("disambiguates names that would collide in a category (case/accent-insensitive)", async () => {
    const { seed, warnings } = await generateSeed(fixtureInput);
    const helms = seed.items
      .filter((entry) => entry.category === "helms")
      .map((entry) => entry.name);
    expect(helms).toEqual(["Bronze Helm", "Scale Helm", "Scale Helm (Lucky)"]);
    expect(warnings).toContainEqual(expect.stringContaining('"Scale Helm (Lucky)"'));

    const other = buildSeed([item({ name: "Kris" }), item({ number: 9, name: "KRÍS" })], SHA).seed;
    expect(other.items.map((entry) => entry.name)).toEqual(["Kris", "KRÍS (0:9)"]);
  });

  it("refuses names longer than the catalog limit", () => {
    expect(() => buildSeed([item({ name: "x".repeat(121) })], SHA)).toThrow(/longer than 120/);
  });

  it("enforces the unparsed limit by default", async () => {
    const { maxUnparsedRatio: _ignored, ...strict } = fixtureInput;
    await expect(generateSeed(strict)).rejects.toThrow(/could not be parsed/);
  });
});

describe("readGitCommit (text only: never runs git inside the untrusted clone)", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  async function fakeClone(files: Record<string, string>): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), "vk-openmu-"));
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(dir, ".git", path, ".."), { recursive: true });
      await writeFile(join(dir, ".git", path), content);
    }
    return dir;
  }

  it("follows HEAD to a loose ref", async () => {
    const clone = await fakeClone({
      HEAD: "ref: refs/heads/master\n",
      "refs/heads/master": `${SHA}\n`,
    });
    expect(await readGitCommit(clone)).toBe(SHA);
  });

  it("follows HEAD to packed-refs", async () => {
    const clone = await fakeClone({
      HEAD: "ref: refs/heads/master\n",
      "packed-refs": `# pack-refs with: peeled fully-peeled sorted\n${SHA} refs/heads/master\n`,
    });
    expect(await readGitCommit(clone)).toBe(SHA);
  });

  it("accepts a detached HEAD", async () => {
    const clone = await fakeClone({ HEAD: `${SHA}\n` });
    expect(await readGitCommit(clone)).toBe(SHA);
  });

  it("not a git checkout -> clear error", async () => {
    dir = await mkdtemp(join(tmpdir(), "vk-openmu-"));
    await expect(readGitCommit(dir)).rejects.toThrow(/not a git checkout.*--commit/);
  });

  it("garbage in HEAD -> error rather than a bogus SHA", async () => {
    const clone = await fakeClone({ HEAD: "hello\n" });
    await expect(readGitCommit(clone)).rejects.toThrow(/commit SHA/);
  });
});

describe("serializeSeed", () => {
  it("is 2-space JSON with a trailing newline (stable diffs)", () => {
    const { seed } = buildSeed([item({})], SHA);
    const text = serializeSeed(seed);
    expect(text).toBe(`${JSON.stringify(seed, null, 2)}\n`);
    expect(JSON.parse(text)).toEqual(seed);
  });

  it("round-trips a real file read back from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vk-seed-"));
    try {
      const path = join(dir, "seed.json");
      const { seed } = await generateSeed(fixtureInput);
      await writeFile(path, serializeSeed(seed));
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(seed);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
