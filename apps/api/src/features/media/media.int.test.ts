import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { IMAGE_MIME } from "@vaultkeeper/shared/constants";
import { catalogItem } from "@vaultkeeper/shared/schemas/catalog";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  signUpAdmin,
  type SignedInUser,
  type TestApp,
} from "../../../test/auth-helpers";
import { insertCategories, insertItems } from "../../../test/catalog-fixtures";
import { useTestDatabase } from "../../../test/db";
import { TEST_PUBLIC_URL } from "../../../test/factories";

const FIXTURES = resolve(import.meta.dirname, "../../../test/fixtures/images");

describe("GET /media/catalog/:file (task 3.15, R-CAT-6 S1, R-DEP-1 S4)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let admin: SignedInUser;
  let png: Uint8Array;
  let webp: Uint8Array;
  let pngKey: string;
  let webpKey: string;

  async function uploadAs(bytes: Uint8Array, type: string, name: string): Promise<string> {
    const [id] = await insertItems(t.database.pool, [{ categorySlug: "wings", name }]);
    const form = new FormData();
    form.append("file", new File([bytes], "upload.bin", { type }));
    const res = await t.app.request(
      `${TEST_PUBLIC_URL}/api/v1/admin/catalog/items/${id ?? ""}/image`,
      { method: "PUT", headers: { origin: TEST_PUBLIC_URL, cookie: admin.cookie }, body: form },
    );
    expect(res.status, await res.clone().text()).toBe(200);
    const key = catalogItem.parse(await res.json()).imageKey;
    if (!key) throw new Error("upload returned no imageKey");
    return key;
  }

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    await insertCategories(t.database.pool, [{ slug: "wings", name: "Wings", icon: "wings" }]);
    admin = await signUpAdmin(t);
    png = new Uint8Array(await readFile(join(FIXTURES, "pixel.png")));
    webp = new Uint8Array(await readFile(join(FIXTURES, "pixel.webp")));
    pngKey = await uploadAs(png, IMAGE_MIME.PNG, "Wings of Storm");
    webpKey = await uploadAs(webp, IMAGE_MIME.WEBP, "Wings of Elf");
  });
  afterAll(async () => {
    await t.close();
  });

  /** No cookie on purpose: media is public (img tags, PWA cache). */
  async function get(path: string, headers: Record<string, string> = {}): Promise<Response> {
    return t.app.request(`${TEST_PUBLIC_URL}${path}`, { headers });
  }

  const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

  it("serves the stored bytes without a session, with immutable caching and safe headers", async () => {
    const res = await get(`/media/${pngKey}`);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(png);
    expect(res.headers.get("content-type")).toBe(IMAGE_MIME.PNG);
    expect(res.headers.get("content-length")).toBe(String(png.byteLength));
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("etag")).toBe(`"${sha(png)}"`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
  });

  it("uses the content type of the stored type (webp)", async () => {
    const res = await get(`/media/${webpKey}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(IMAGE_MIME.WEBP);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(webp);
  });

  it("answers 304 with no body when If-None-Match carries the ETag", async () => {
    const etag = `"${sha(png)}"`;
    for (const header of [etag, `W/${etag}`, `"other", ${etag}`, "*"]) {
      const res = await get(`/media/${pngKey}`, { "if-none-match": header });
      expect(res.status, header).toBe(304);
      expect(await res.text()).toBe("");
      expect(res.headers.get("etag")).toBe(etag);
      expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    }
    expect((await get(`/media/${pngKey}`, { "if-none-match": '"stale"' })).status).toBe(200);
  });

  it("404s a well-formed name that is not stored, even with a matching If-None-Match", async () => {
    const missing = "0".repeat(64);
    expect((await get(`/media/catalog/${missing}.png`)).status).toBe(404);
    const conditional = { "if-none-match": `"${missing}"` };
    expect((await get(`/media/catalog/${missing}.png`, conditional)).status).toBe(404);
    expect((await get(`/media/catalog/${missing}.png`, { "if-none-match": "*" })).status).toBe(404);
  });

  it.each([
    `/media/catalog/${"A".repeat(64)}.png`,
    `/media/catalog/${"a".repeat(64)}.gif`,
    `/media/catalog/${"a".repeat(63)}.png`,
    "/media/catalog/secret.png",
    "/media/catalog/..%2Fsecret.png",
    "/media/catalog/..%2F..%2Fpackage.json",
    "/media/catalog/%2e%2e%2fsecret.png",
    "/media/secret.png",
    "/media/catalog/",
  ])("404s bad names and traversal attempts: %s", async (path) => {
    // A real file one level up: a traversal bug would serve it.
    await writeFile(join(t.mediaDir, "secret.png"), png);
    const res = await get(path);
    expect(res.status).toBe(404);
    expect(new Uint8Array(await res.arrayBuffer())).not.toEqual(png);
  });
});
