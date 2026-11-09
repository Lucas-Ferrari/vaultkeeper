import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type { ImageMime } from "@vaultkeeper/shared/constants";
import { contentTypeOfKey, type StorageAdapter, type StoredObject } from "./storage-adapter";

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

/**
 * StorageAdapter on the server's own disk (design 09, ADR17): MEDIA_DIR, a Docker volume in
 * production. Writes go to a temp file in the target directory and are renamed into place, so a
 * reader never sees a half-written image.
 */
export function createLocalDiskAdapter(rootDir: string): StorageAdapter {
  const root = resolve(rootDir);

  /** Absolute path for `key`; throws unless it stays strictly inside the root. */
  function pathOf(key: string): string {
    const path = resolve(root, key);
    if (key === "" || !path.startsWith(root + sep)) {
      throw new Error(`storage key escapes the storage root: ${JSON.stringify(key)}`);
    }
    return path;
  }

  function contentTypeOf(key: string): ImageMime {
    const contentType = contentTypeOfKey(key);
    if (!contentType) throw new Error(`storage key has no image extension: ${JSON.stringify(key)}`);
    return contentType;
  }

  return {
    async put(key, data, contentType) {
      const path = pathOf(key);
      if (contentTypeOf(key) !== contentType) {
        throw new Error(`content type ${contentType} does not match key ${JSON.stringify(key)}`);
      }
      if (await exists(path)) return;
      await mkdir(dirname(path), { recursive: true });
      const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
      try {
        await writeFile(temp, data, { flag: "wx" });
        await rename(temp, path);
      } catch (error) {
        await rm(temp, { force: true });
        throw error;
      }
    },

    async get(key): Promise<StoredObject | null> {
      const path = pathOf(key);
      const contentType = contentTypeOf(key);
      let size: number;
      try {
        const stats = await stat(path);
        if (!stats.isFile()) return null;
        size = stats.size;
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
      const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
      return { body, size, contentType };
    },

    async delete(key) {
      await rm(pathOf(key), { force: true });
    },
  };
}
