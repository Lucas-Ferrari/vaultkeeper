import { IMAGE_KEY_PATTERN } from "@vaultkeeper/shared/constants";
import { Hono } from "hono";
import { NotFoundError } from "../../shared/http/errors";
import type { StorageAdapter } from "../../storage/storage-adapter";

/** Content-addressed files never change, so caches may keep them for a year (design 09). */
export const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";
/** An image response never needs to load or run anything. */
export const MEDIA_CSP = "default-src 'none'";

/** If-None-Match is `*` or a list of (possibly weak) entity tags. */
function matchesEtag(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
    .some((tag) => tag === "*" || tag === etag);
}

/**
 * /media/* (design 09, R-CAT-6 S1): public, no session (images load from <img> and the PWA cache).
 * Only names that are exactly a stored key (`<sha256>.<png|jpg|webp>`) reach storage, so encoded
 * traversal (`..%2F`) or any other name is a 404 before a path is ever built.
 */
export function mediaRoutes(storage: StorageAdapter) {
  return new Hono().get("/catalog/:file", async (c) => {
    const key = `catalog/${c.req.param("file")}`;
    if (!IMAGE_KEY_PATTERN.test(key)) throw new NotFoundError();
    const sha256 = key.slice("catalog/".length, key.lastIndexOf("."));
    const etag = `"${sha256}"`;
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Content-Security-Policy", MEDIA_CSP);
    const object = await storage.get(key);
    if (!object) throw new NotFoundError();
    c.header("Cache-Control", MEDIA_CACHE_CONTROL);
    c.header("ETag", etag);
    if (matchesEtag(c.req.header("if-none-match"), etag)) {
      await object.body.cancel(); // close the file: a 304 sends no body
      return c.body(null, 304);
    }
    c.header("Content-Type", object.contentType);
    c.header("Content-Length", String(object.size));
    return c.body(object.body, 200);
  });
}
