import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { IMAGE_MIME, UPLOAD_MAX_BYTES } from "@vaultkeeper/shared/constants";
import { ERROR_CODE, type ApiErrorBody, type ErrorCode } from "@vaultkeeper/shared/errors";
import { catalogItem, type CatalogItem } from "@vaultkeeper/shared/schemas/catalog";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  sendJson,
  signUp,
  signUpAdmin,
  type SignedInUser,
  type TestApp,
} from "../../../test/auth-helpers";
import { insertCategories, insertItems } from "../../../test/catalog-fixtures";
import { useTestDatabase } from "../../../test/db";
import { requireUser, sessionMiddleware } from "../../auth/middleware";
import { createErrorHandler } from "../../shared/http/on-error";
import { catalogImageRoutes } from "./routes";
import { createCatalogImageService } from "./service";
import { TEST_PUBLIC_URL } from "../../../test/factories";

const FIXTURES = resolve(import.meta.dirname, "../../../test/fixtures/images");
const MISSING_ID = "6f1c2c9e-3f7a-4a51-9b51-2b1f1d2b9c11";

async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(FIXTURES, name)));
}

/** A valid image header followed by `size - header` filler bytes (sniffing reads the header). */
function padded(header: Uint8Array, size: number, fill = 0): Uint8Array {
  const bytes = new Uint8Array(size).fill(fill);
  bytes.set(header.subarray(0, Math.min(header.byteLength, size)));
  return bytes;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const imagePath = (id: string) => `/api/v1/admin/catalog/items/${id}/image`;

describe("admin item image upload / remove (task 3.14, R-CAT-6)", () => {
  const db = useTestDatabase();
  let t: TestApp;
  let admin: SignedInUser;
  let member: SignedInUser;
  let png: Uint8Array;
  let jpeg: Uint8Array;
  let webp: Uint8Array;
  let gif: Uint8Array;
  let text: Uint8Array;

  beforeAll(async () => {
    t = createTestApp(db.current.url);
    await insertCategories(t.database.pool, [{ slug: "wings", name: "Wings", icon: "wings" }]);
    admin = await signUpAdmin(t);
    member = await signUp(t.app);
    png = await fixture("pixel.png");
    jpeg = await fixture("pixel.jpg");
    webp = await fixture("pixel.webp");
    gif = await fixture("pixel.gif");
    text = await fixture("not-an-image.txt");
  });
  afterAll(async () => {
    await t.close();
  });

  let itemSeq = 0;
  async function newItem(): Promise<string> {
    itemSeq += 1;
    const [id] = await insertItems(t.database.pool, [
      { categorySlug: "wings", name: `Wings ${itemSeq}` },
    ]);
    if (!id) throw new Error("no item id");
    return id;
  }

  async function putForm(id: string, form: FormData, cookie: string): Promise<Response> {
    return t.app.request(`${TEST_PUBLIC_URL}${imagePath(id)}`, {
      method: "PUT",
      headers: { origin: TEST_PUBLIC_URL, cookie },
      body: form,
    });
  }

  function upload(
    id: string,
    bytes: Uint8Array,
    type: string,
    cookie = admin.cookie,
    field = "file",
  ): Promise<Response> {
    const form = new FormData();
    form.append(field, new File([bytes], "upload.bin", { type }));
    return putForm(id, form, cookie);
  }

  async function uploadOk(id: string, bytes: Uint8Array, type: string): Promise<CatalogItem> {
    const res = await upload(id, bytes, type);
    expect(res.status, await res.clone().text()).toBe(200);
    return catalogItem.parse(await res.json());
  }

  async function expectError(res: Response, status: number, code: ErrorCode): Promise<void> {
    expect(res.status).toBe(status);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe(code);
  }

  async function imageKeyOf(id: string): Promise<string | null> {
    const { rows } = await t.database.pool.query<{ image_key: string | null }>(
      "SELECT image_key FROM catalog_items WHERE id = $1",
      [id],
    );
    return rows[0]?.image_key ?? null;
  }

  async function onDisk(key: string): Promise<boolean> {
    try {
      return (await stat(join(t.mediaDir, key))).isFile();
    } catch {
      return false;
    }
  }

  async function storedFiles(): Promise<string[]> {
    try {
      return (await readdir(join(t.mediaDir, "catalog"))).sort();
    } catch {
      return [];
    }
  }

  it("S1: a 200 KB png is stored as catalog/<sha256>.png and referenced by the item", async () => {
    const id = await newItem();
    const bytes = padded(png, 200 * 1024);
    const item = await uploadOk(id, bytes, IMAGE_MIME.PNG);
    const key = `catalog/${sha256(bytes)}.png`;
    expect(item.id).toBe(id);
    expect(item.imageKey).toBe(key);
    expect(await imageKeyOf(id)).toBe(key);
    expect(new Uint8Array(await readFile(join(t.mediaDir, key)))).toEqual(bytes);
  });

  it("stores jpeg as .jpg and webp as .webp (extension from the sniffed type)", async () => {
    expect((await uploadOk(await newItem(), jpeg, IMAGE_MIME.JPEG)).imageKey).toBe(
      `catalog/${sha256(jpeg)}.jpg`,
    );
    expect((await uploadOk(await newItem(), webp, IMAGE_MIME.WEBP)).imageKey).toBe(
      `catalog/${sha256(webp)}.webp`,
    );
  });

  it("accepts exactly UPLOAD_MAX_BYTES (1 MiB)", async () => {
    await uploadOk(await newItem(), padded(png, UPLOAD_MAX_BYTES, 1), IMAGE_MIME.PNG);
  });

  describe("S2: rejected uploads leave the item unchanged", () => {
    let id: string;
    let originalKey: string | null;
    beforeAll(async () => {
      id = await newItem();
      originalKey = (await uploadOk(id, padded(png, 64, 7), IMAGE_MIME.PNG)).imageKey;
    });

    it.each([
      ["gif declared as gif", () => gif, "image/gif"],
      ["gif declared as png", () => gif, IMAGE_MIME.PNG],
      ["text declared as png", () => text, IMAGE_MIME.PNG],
      ["jpeg bytes declared as png", () => jpeg, IMAGE_MIME.PNG],
      ["png bytes declared as jpeg", () => png, IMAGE_MIME.JPEG],
      ["png bytes with no declared type", () => png, ""],
      ["an empty file", () => new Uint8Array(), IMAGE_MIME.PNG],
    ])("%s -> 422 UPLOAD_REJECTED", async (_label, bytes, type) => {
      const before = await storedFiles();
      await expectError(await upload(id, bytes(), type), 422, ERROR_CODE.UPLOAD_REJECTED);
      expect(await imageKeyOf(id)).toBe(originalKey);
      expect(await storedFiles()).toEqual(before);
    });

    it("1 MiB + 1 byte -> 413 PAYLOAD_TOO_LARGE", async () => {
      const res = await upload(id, padded(png, UPLOAD_MAX_BYTES + 1), IMAGE_MIME.PNG);
      await expectError(res, 413, ERROR_CODE.PAYLOAD_TOO_LARGE);
      expect(await imageKeyOf(id)).toBe(originalKey);
    });

    it("3 MB (over the route body limit) -> 413 PAYLOAD_TOO_LARGE", async () => {
      const res = await upload(id, padded(png, 3 * 1024 * 1024), IMAGE_MIME.PNG);
      await expectError(res, 413, ERROR_CODE.PAYLOAD_TOO_LARGE);
      expect(await imageKeyOf(id)).toBe(originalKey);
    });

    it("a body over the route limit is refused before parsing, even with a valid file", async () => {
      const form = new FormData();
      form.append("junk", "x".repeat(2 * 1024 * 1024));
      form.append("file", new File([png], "a.png", { type: IMAGE_MIME.PNG }));
      await expectError(await putForm(id, form, admin.cookie), 413, ERROR_CODE.PAYLOAD_TOO_LARGE);
      expect(await imageKeyOf(id)).toBe(originalKey);
    });

    it("no `file` field -> 422 VALIDATION_FAILED", async () => {
      const res = await upload(id, png, IMAGE_MIME.PNG, admin.cookie, "picture");
      await expectError(res, 422, ERROR_CODE.VALIDATION_FAILED);
      expect(await imageKeyOf(id)).toBe(originalKey);
    });
  });

  it("S4: identical bytes reuse one stored file (same key)", async () => {
    const bytes = padded(png, 2048, 3);
    const first = await uploadOk(await newItem(), bytes, IMAGE_MIME.PNG);
    const second = await uploadOk(await newItem(), bytes, IMAGE_MIME.PNG);
    expect(second.imageKey).toBe(first.imageKey);
    const name = `${sha256(bytes)}.png`;
    expect((await storedFiles()).filter((file) => file === name)).toHaveLength(1);
  });

  it("S4: replacing an image shows the new one and deletes the old file", async () => {
    const id = await newItem();
    const old = await uploadOk(id, padded(png, 1024, 11), IMAGE_MIME.PNG);
    const replaced = await uploadOk(id, padded(png, 1024, 12), IMAGE_MIME.PNG);
    expect(replaced.imageKey).not.toBe(old.imageKey);
    expect(await imageKeyOf(id)).toBe(replaced.imageKey);
    expect(await onDisk(old.imageKey ?? "")).toBe(false);
    expect(await onDisk(replaced.imageKey ?? "")).toBe(true);
  });

  it("replacing keeps the old file while another item still uses it", async () => {
    const shared = padded(png, 1024, 21);
    const keeper = await newItem();
    const replacer = await newItem();
    const sharedKey = (await uploadOk(keeper, shared, IMAGE_MIME.PNG)).imageKey ?? "";
    await uploadOk(replacer, shared, IMAGE_MIME.PNG);
    await uploadOk(replacer, padded(png, 1024, 22), IMAGE_MIME.PNG);
    expect(await onDisk(sharedKey)).toBe(true);
    expect(await imageKeyOf(keeper)).toBe(sharedKey);
  });

  it("re-uploading the same bytes to the same item keeps its file", async () => {
    const id = await newItem();
    const bytes = padded(png, 1024, 31);
    const first = await uploadOk(id, bytes, IMAGE_MIME.PNG);
    await uploadOk(id, bytes, IMAGE_MIME.PNG);
    expect(await onDisk(first.imageKey ?? "")).toBe(true);
  });

  it("DELETE clears the image and removes the unused file; repeating it is a no-op", async () => {
    const id = await newItem();
    const key = (await uploadOk(id, padded(png, 1024, 41), IMAGE_MIME.PNG)).imageKey ?? "";
    const res = await sendJson(t.app, "DELETE", imagePath(id), undefined, admin.cookie);
    expect(res.status).toBe(200);
    expect(catalogItem.parse(await res.json()).imageKey).toBeNull();
    expect(await imageKeyOf(id)).toBeNull();
    expect(await onDisk(key)).toBe(false);
    const again = await sendJson(t.app, "DELETE", imagePath(id), undefined, admin.cookie);
    expect(again.status).toBe(200);
  });

  it("DELETE keeps the file while another item uses it", async () => {
    const bytes = padded(png, 1024, 51);
    const a = await newItem();
    const b = await newItem();
    const key = (await uploadOk(a, bytes, IMAGE_MIME.PNG)).imageKey ?? "";
    await uploadOk(b, bytes, IMAGE_MIME.PNG);
    await sendJson(t.app, "DELETE", imagePath(a), undefined, admin.cookie);
    expect(await onDisk(key)).toBe(true);
  });

  it("R-AUTH-4 S1: a non-admin gets 403 on upload and delete, nothing changes", async () => {
    const id = await newItem();
    const before = await storedFiles();
    await expectError(
      await upload(id, padded(png, 512, 61), IMAGE_MIME.PNG, member.cookie),
      403,
      ERROR_CODE.FORBIDDEN,
    );
    await expectError(
      await sendJson(t.app, "DELETE", imagePath(id), undefined, member.cookie),
      403,
      ERROR_CODE.FORBIDDEN,
    );
    expect(await imageKeyOf(id)).toBeNull();
    expect(await storedFiles()).toEqual(before);
  });

  it("the image router guards itself: mounted alone it still refuses non-admins", async () => {
    const images = createCatalogImageService({ db: t.database.db, storage: t.storage });
    const standalone = new Hono()
      .use(sessionMiddleware(t.auth))
      .use(requireUser)
      .route("/admin/catalog", catalogImageRoutes(images, UPLOAD_MAX_BYTES));
    standalone.onError(createErrorHandler());
    const form = new FormData();
    form.append("file", new File([png], "a.png", { type: IMAGE_MIME.PNG }));
    const res = await standalone.request(
      `${TEST_PUBLIC_URL}/admin/catalog/items/${await newItem()}/image`,
      {
        method: "PUT",
        headers: { origin: TEST_PUBLIC_URL, cookie: member.cookie },
        body: form,
      },
    );
    await expectError(res, 403, ERROR_CODE.FORBIDDEN);
  });

  it("unknown item -> 404 and no file is written; malformed id -> 422", async () => {
    const before = await storedFiles();
    await expectError(
      await upload(MISSING_ID, padded(png, 512, 71), IMAGE_MIME.PNG),
      404,
      ERROR_CODE.NOT_FOUND,
    );
    expect(await storedFiles()).toEqual(before);
    await expectError(
      await sendJson(t.app, "DELETE", imagePath(MISSING_ID), undefined, admin.cookie),
      404,
      ERROR_CODE.NOT_FOUND,
    );
    await expectError(
      await upload("not-a-uuid", png, IMAGE_MIME.PNG),
      422,
      ERROR_CODE.VALIDATION_FAILED,
    );
  });

  describe("hard-deleting an item cleans up its image file (no orphans)", () => {
    const removeItem = (id: string) =>
      sendJson(t.app, "DELETE", `/api/v1/admin/catalog/items/${id}`, undefined, admin.cookie);

    it("deletes the file when no other item uses it", async () => {
      const id = await newItem();
      const key = (await uploadOk(id, padded(png, 1024, 81), IMAGE_MIME.PNG)).imageKey ?? "";
      expect(await onDisk(key)).toBe(true);
      expect((await removeItem(id)).status).toBe(204);
      expect(await onDisk(key)).toBe(false);
    });

    it("keeps the file while another item still uses it", async () => {
      const bytes = padded(png, 1024, 82);
      const a = await newItem();
      const b = await newItem();
      const key = (await uploadOk(a, bytes, IMAGE_MIME.PNG)).imageKey ?? "";
      await uploadOk(b, bytes, IMAGE_MIME.PNG);
      expect((await removeItem(a)).status).toBe(204);
      expect(await onDisk(key)).toBe(true);
      expect(await imageKeyOf(b)).toBe(key);
    });
  });

  describe("UPLOAD_MAX_BYTES comes from the environment (design 15)", () => {
    const LIMIT = 4096;
    let small: TestApp;
    beforeAll(() => {
      small = createTestApp(db.current.url, { env: { UPLOAD_MAX_BYTES: String(LIMIT) } });
    });
    afterAll(async () => {
      await small.close();
    });

    async function uploadSmall(id: string, form: FormData): Promise<Response> {
      return small.app.request(`${TEST_PUBLIC_URL}${imagePath(id)}`, {
        method: "PUT",
        headers: { origin: TEST_PUBLIC_URL, cookie: admin.cookie },
        body: form,
      });
    }

    function fileForm(bytes: Uint8Array): FormData {
      const form = new FormData();
      form.append("file", new File([bytes], "a.png", { type: IMAGE_MIME.PNG }));
      return form;
    }

    it("accepts exactly the configured limit and rejects one byte more (413)", async () => {
      const id = await newItem();
      expect((await uploadSmall(id, fileForm(padded(png, LIMIT, 1)))).status).toBe(200);
      const res = await uploadSmall(id, fileForm(padded(png, LIMIT + 1, 2)));
      expect(res.status).toBe(413);
      const body = (await res.json()) as ApiErrorBody;
      expect(body.error.code).toBe(ERROR_CODE.PAYLOAD_TOO_LARGE);
      expect(body.error.message).toContain(String(LIMIT));
    });

    it("the route body limit follows the configured limit (+ form overhead)", async () => {
      const form = fileForm(png);
      form.append("junk", "x".repeat(64 * 1024));
      const res = await uploadSmall(await newItem(), form);
      expect(res.status).toBe(413);
      expect(((await res.json()) as ApiErrorBody).error.message).toMatch(/Request body exceeds/);
    });
  });
});
