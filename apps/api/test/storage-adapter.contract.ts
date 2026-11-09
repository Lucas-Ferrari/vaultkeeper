import { IMAGE_MIME } from "@vaultkeeper/shared/constants";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StorageAdapter, StoredObject } from "../src/storage/storage-adapter";

/** A fresh adapter on empty storage, plus how to dispose of it. */
export interface StorageAdapterFixture {
  adapter: StorageAdapter;
  cleanup(): Promise<void>;
}

async function bytesOf(object: StoredObject): Promise<Uint8Array> {
  return new Uint8Array(await new Response(object.body).arrayBuffer());
}

const KEY = "catalog/aaaa.png";
const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

/**
 * Shared StorageAdapter contract (ADR17, design 16b). Every adapter (LocalDiskAdapter now, an S3
 * adapter later) MUST pass it unchanged: `describeStorageAdapter("S3Adapter", makeS3)`.
 */
export function describeStorageAdapter(
  name: string,
  make: () => Promise<StorageAdapterFixture>,
): void {
  describe(`StorageAdapter contract: ${name}`, () => {
    let fixture: StorageAdapterFixture;

    beforeEach(async () => {
      fixture = await make();
    });
    afterEach(async () => {
      await fixture.cleanup();
    });

    it("put then get returns the same bytes, size and content type", async () => {
      await fixture.adapter.put(KEY, BYTES, IMAGE_MIME.PNG);
      const object = await fixture.adapter.get(KEY);
      expect(object).not.toBeNull();
      if (!object) return;
      expect(object.size).toBe(BYTES.byteLength);
      expect(object.contentType).toBe(IMAGE_MIME.PNG);
      expect(await bytesOf(object)).toEqual(BYTES);
    });

    it("get of a missing key returns null", async () => {
      expect(await fixture.adapter.get("catalog/missing.png")).toBeNull();
    });

    it("delete removes the object and is idempotent", async () => {
      await fixture.adapter.put(KEY, BYTES, IMAGE_MIME.PNG);
      await fixture.adapter.delete(KEY);
      expect(await fixture.adapter.get(KEY)).toBeNull();
      await expect(fixture.adapter.delete(KEY)).resolves.toBeUndefined();
      await expect(fixture.adapter.delete("catalog/never-existed.png")).resolves.toBeUndefined();
    });

    it("put on an existing key is a no-op (content-addressed keys)", async () => {
      await fixture.adapter.put(KEY, BYTES, IMAGE_MIME.PNG);
      await fixture.adapter.put(KEY, new Uint8Array([9, 9, 9]), IMAGE_MIME.PNG);
      const object = await fixture.adapter.get(KEY);
      expect(object && (await bytesOf(object))).toEqual(BYTES);
    });

    it("content type follows the key extension (jpg, webp)", async () => {
      await fixture.adapter.put("catalog/b.jpg", BYTES, IMAGE_MIME.JPEG);
      await fixture.adapter.put("catalog/c.webp", BYTES, IMAGE_MIME.WEBP);
      expect((await fixture.adapter.get("catalog/b.jpg"))?.contentType).toBe(IMAGE_MIME.JPEG);
      expect((await fixture.adapter.get("catalog/c.webp"))?.contentType).toBe(IMAGE_MIME.WEBP);
    });

    it.each(["../escape.png", "catalog/../../escape.png", "/etc/passwd", ""])(
      "rejects key %j that escapes the storage root",
      async (key) => {
        await expect(fixture.adapter.put(key, BYTES, IMAGE_MIME.PNG)).rejects.toThrow();
        await expect(fixture.adapter.get(key)).rejects.toThrow();
        await expect(fixture.adapter.delete(key)).rejects.toThrow();
      },
    );
  });
}
