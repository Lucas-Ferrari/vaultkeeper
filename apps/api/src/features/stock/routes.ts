import {
  createStockEntryInput,
  moveStockEntryInput,
  stockListQuery,
  updateStockEntryInput,
} from "@vaultkeeper/shared/schemas/stock";
import { Hono } from "hono";
import type { AuthedEnv } from "../../auth/middleware";
import { idParam } from "../../shared/http/params";
import { validate } from "../../shared/http/validator";
import type { StockService } from "./service";

/** /api/v1/stock (design 03). */
export function stockRoutes(stock: StockService) {
  return new Hono<AuthedEnv>()
    .get("/", validate("query", stockListQuery), async (c) =>
      c.json(await stock.list(c.get("user").id, c.req.valid("query")), 200),
    )
    .post("/", validate("json", createStockEntryInput), async (c) =>
      c.json(await stock.create(c.get("user").id, c.req.valid("json")), 201),
    )
    .get("/:id", validate("param", idParam), async (c) =>
      c.json(await stock.get(c.get("user").id, c.req.valid("param").id), 200),
    )
    .patch("/:id", validate("param", idParam), validate("json", updateStockEntryInput), async (c) =>
      c.json(
        await stock.update(c.get("user").id, c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
    )
    .delete("/:id", validate("param", idParam), async (c) => {
      await stock.remove(c.get("user").id, c.req.valid("param").id);
      return c.body(null, 204);
    })
    .post(
      "/:id/move",
      validate("param", idParam),
      validate("json", moveStockEntryInput),
      async (c) =>
        c.json(
          await stock.move(
            c.get("user").id,
            c.req.valid("param").id,
            c.req.valid("json").storageLocationId,
          ),
          200,
        ),
    );
}
