import {
  adminCatalogSearchQuery,
  catalogSearchQuery,
  categorySlug,
  createCatalogItemInput,
  createCategoryInput,
  updateCatalogItemInput,
  updateCategoryInput,
} from "@vaultkeeper/shared/schemas/catalog";
import { Hono } from "hono";
import { z } from "zod";
import { requireAdmin, type AuthedEnv } from "../../auth/middleware";
import { idParam } from "../../shared/http/params";
import { validate } from "../../shared/http/validator";
import type { CatalogService } from "./service";

const slugParam = z.object({ slug: categorySlug });

/** /api/v1/catalog (design 03): reads for any signed-in user. */
export function catalogRoutes(catalog: CatalogService) {
  return new Hono<AuthedEnv>()
    .get("/items", validate("query", catalogSearchQuery), async (c) =>
      c.json(await catalog.listActiveItems(c.req.valid("query")), 200),
    )
    .get("/items/:id", validate("param", idParam), async (c) =>
      c.json(await catalog.getActiveItem(c.req.valid("param").id), 200),
    )
    .get("/categories", async (c) => c.json(await catalog.listCategories(), 200));
}

/**
 * /api/v1/admin/catalog (design 03): every route is admin-only (R-AUTH-4). requireAdmin runs
 * before validation, so a user gets 403 whatever the body.
 */
export function adminCatalogRoutes(catalog: CatalogService) {
  return new Hono<AuthedEnv>()
    .use(requireAdmin)
    .get("/items", validate("query", adminCatalogSearchQuery), async (c) =>
      c.json(await catalog.adminListItems(c.req.valid("query")), 200),
    )
    .get("/items/:id", validate("param", idParam), async (c) =>
      c.json(await catalog.adminGetItem(c.req.valid("param").id), 200),
    )
    .post("/items", validate("json", createCatalogItemInput), async (c) =>
      c.json(await catalog.createItem(c.req.valid("json")), 201),
    )
    .patch(
      "/items/:id",
      validate("param", idParam),
      validate("json", updateCatalogItemInput),
      async (c) =>
        c.json(await catalog.updateItem(c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .delete("/items/:id", validate("param", idParam), async (c) => {
      await catalog.deleteItem(c.req.valid("param").id);
      return c.body(null, 204);
    })
    .post("/categories", validate("json", createCategoryInput), async (c) =>
      c.json(await catalog.createCategory(c.req.valid("json")), 201),
    )
    .patch(
      "/categories/:slug",
      validate("param", slugParam),
      validate("json", updateCategoryInput),
      async (c) =>
        c.json(await catalog.updateCategory(c.req.valid("param").slug, c.req.valid("json")), 200),
    );
}
