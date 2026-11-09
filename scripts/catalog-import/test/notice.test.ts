import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");

describe("NOTICE (task 3.11, R-DOC-1 S2)", () => {
  it("credits OpenMU (MIT, (c) 2017 MUnique) with the full license text and the pinned commit", async () => {
    const notice = await readFile(join(ROOT, "NOTICE"), "utf8");
    const seed = JSON.parse(
      await readFile(join(ROOT, "apps/api/seed/catalog.openmu-s6.json"), "utf8"),
    ) as { openmuCommit: string };

    expect(notice).toContain("OpenMU");
    expect(notice).toContain("https://github.com/MUnique/OpenMU");
    expect(notice).toContain("(c) 2017 MUnique");
    expect(notice).toContain("MIT License");
    expect(notice).toContain("Copyright 2017 MUnique");
    expect(notice).toContain("Permission is hereby granted, free of charge");
    expect(notice).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    expect(notice).toContain("apps/api/seed/catalog.openmu-s6.json");
    expect(notice).toContain(seed.openmuCommit);
  });
});
