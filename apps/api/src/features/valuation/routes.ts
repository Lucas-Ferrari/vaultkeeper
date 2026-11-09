import { valuationSummaryQuery } from "@vaultkeeper/shared/schemas/valuation";
import { Hono } from "hono";
import type { AuthedEnv } from "../../auth/middleware";
import { idParam } from "../../shared/http/params";
import { validate } from "../../shared/http/validator";
import type { ValuationService } from "./service";

/** /api/v1/valuation (design 03). */
export function valuationRoutes(valuation: ValuationService) {
  return new Hono<AuthedEnv>()
    .get("/summary", validate("query", valuationSummaryQuery), async (c) =>
      c.json(await valuation.summary(c.get("user").id, c.req.valid("query").accountId), 200),
    )
    .get("/groups/:id", validate("param", idParam), async (c) =>
      c.json(await valuation.group(c.get("user").id, c.req.valid("param").id), 200),
    );
}
