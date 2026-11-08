import { csvImportQuery } from "@vaultkeeper/shared/schemas/csv";
import { Hono } from "hono";
import { z } from "zod";
import { requireAdmin, type AuthedEnv } from "../../auth/middleware";
import { limitBody, multipartBodyLimit } from "../../shared/http/body-limit";
import { validate } from "../../shared/http/validator";
import type { CatalogImportService } from "./service";

const csvUploadForm = z.object({
  file: z.instanceof(File, { error: "Attach the CSV as `file`" }),
});

/** POST /api/v1/admin/catalog/import?dryRun= (design 11), admin-only; guards itself. */
export function catalogImportRoutes(imports: CatalogImportService, csvMaxBytes: number) {
  return new Hono<AuthedEnv>()
    .use(requireAdmin)
    .post(
      "/import",
      limitBody(multipartBodyLimit(csvMaxBytes)),
      validate("query", csvImportQuery),
      validate("form", csvUploadForm),
      async (c) =>
        c.json(
          await imports.importCsv(c.req.valid("form").file, {
            dryRun: c.req.valid("query").dryRun,
          }),
          200,
        ),
    );
}
