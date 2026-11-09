import { updateSettingsInput } from "@vaultkeeper/shared/schemas/settings";
import { Hono } from "hono";
import { requireAdmin, type AuthedEnv } from "../../auth/middleware";
import { validate } from "../../shared/http/validator";
import type { SettingsService } from "./service";

/** GET /api/v1/settings: any signed-in user (R-SET-2 S1). */
export function settingsRoutes(settings: SettingsService) {
  return new Hono<AuthedEnv>().get("/", async (c) => c.json(await settings.get(), 200));
}

/** PATCH /api/v1/admin/settings: admin only (R-SET-2 S2); requireAdmin runs before validation. */
export function adminSettingsRoutes(settings: SettingsService) {
  return new Hono<AuthedEnv>()
    .use(requireAdmin)
    .patch("/", validate("json", updateSettingsInput), async (c) =>
      c.json(await settings.update(c.req.valid("json"), c.get("user").id), 200),
    );
}
