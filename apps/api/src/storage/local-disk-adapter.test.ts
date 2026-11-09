import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IMAGE_MIME } from "@vaultkeeper/shared/constants";
import { describe, expect, it } from "vitest";
import { describeStorageAdapter } from "../../test/storage-adapter.contract";
import { createLocalDiskAdapter } from "./local-disk-adapter";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "vk-media-"));
}

describeStorageAdapter("LocalDiskAdapter", async () => {
  const root = await tempRoot();
  return {
    adapter: createLocalDiskAdapter(root),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
});

describe("LocalDiskAdapter on disk (task 3.12)", () => {
  it("writes the file at root/key and leaves no temp file behind", async () => {
    const root = await tempRoot();
    try {
      await createLocalDiskAdapter(root).put("catalog/x.png", new Uint8Array([1]), IMAGE_MIME.PNG);
      expect(await readdir(join(root, "catalog"))).toEqual(["x.png"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
