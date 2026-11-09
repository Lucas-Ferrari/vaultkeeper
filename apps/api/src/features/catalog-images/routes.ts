import { Hono } from "hono";
import { z } from "zod";
import { requireAdmin, type AuthedEnv } from "../../auth/middleware";
import { limitBody, multipartBodyLimit } from "../../shared/http/body-limit";
import { idParam } from "../../shared/http/params";
import { validate } from "../../shared/http/validator";
import type { CatalogImageService } from "./service";

/** multipart/form-data with the image in field `file` (design 09). */
const imageUploadForm = z.object({
  file: z.instanceof(File, { error: "Attach the image as `file`" }),
});

/**
 * /api/v1/admin/catalog/items/:id/image (design 03/09), admin-only (R-AUTH-4). requireAdmin runs
 * before the body is read; the multipart body limit (UPLOAD_MAX_BYTES + 16 KB form overhead)
 * answers 413. The file size itself is checked by the service against the same limit.
 */
export function catalogImageRoutes(images: CatalogImageService, uploadMaxBytes: number) {
  return new Hono<AuthedEnv>()
    .use(requireAdmin)
    .put(
      "/items/:id/image",
      limitBody(multipartBodyLimit(uploadMaxBytes)),
      validate("param", idParam),
      validate("form", imageUploadForm),
      async (c) =>
        c.json(await images.upload(c.req.valid("param").id, c.req.valid("form").file), 200),
    )
    .delete("/items/:id/image", validate("param", idParam), async (c) =>
      c.json(await images.remove(c.req.valid("param").id), 200),
    );
}
