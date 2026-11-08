import {
  addGroupEntriesInput,
  createGroupInput,
  replaceGroupEntriesInput,
  updateGroupInput,
} from "@vaultkeeper/shared/schemas/groups";
import { Hono } from "hono";
import { z } from "zod";
import type { AuthedEnv } from "../../auth/middleware";
import { idParam } from "../../shared/http/params";
import { validate } from "../../shared/http/validator";
import type { GroupsService } from "./service";

const memberParam = z.object({ id: z.uuid(), entryId: z.uuid() });

/** /api/v1/groups (design 03). */
export function groupRoutes(groups: GroupsService) {
  return new Hono<AuthedEnv>()
    .get("/", async (c) => c.json(await groups.list(c.get("user").id), 200))
    .post("/", validate("json", createGroupInput), async (c) =>
      c.json(await groups.create(c.get("user").id, c.req.valid("json")), 201),
    )
    .get("/:id", validate("param", idParam), async (c) =>
      c.json(await groups.get(c.get("user").id, c.req.valid("param").id), 200),
    )
    .patch("/:id", validate("param", idParam), validate("json", updateGroupInput), async (c) =>
      c.json(
        await groups.update(c.get("user").id, c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
    )
    .delete("/:id", validate("param", idParam), async (c) => {
      await groups.remove(c.get("user").id, c.req.valid("param").id);
      return c.body(null, 204);
    })
    .post(
      "/:id/entries",
      validate("param", idParam),
      validate("json", addGroupEntriesInput),
      async (c) =>
        c.json(
          await groups.addEntries(
            c.get("user").id,
            c.req.valid("param").id,
            c.req.valid("json").stockEntryIds,
          ),
          200,
        ),
    )
    .put(
      "/:id/entries",
      validate("param", idParam),
      validate("json", replaceGroupEntriesInput),
      async (c) =>
        c.json(
          await groups.replaceEntries(
            c.get("user").id,
            c.req.valid("param").id,
            c.req.valid("json").stockEntryIds,
          ),
          200,
        ),
    )
    .delete("/:id/entries/:entryId", validate("param", memberParam), async (c) => {
      const { id, entryId } = c.req.valid("param");
      await groups.removeEntry(c.get("user").id, id, entryId);
      return c.body(null, 204);
    });
}
