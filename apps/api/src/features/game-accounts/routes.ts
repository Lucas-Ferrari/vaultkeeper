import {
  createCharacterInput,
  createGameAccountInput,
  updateCharacterInput,
  updateGameAccountInput,
} from "@vaultkeeper/shared/schemas/game-accounts";
import { Hono } from "hono";
import type { AuthedEnv } from "../../auth/middleware";
import { idParam } from "../../shared/http/params";
import { validate } from "../../shared/http/validator";
import type { GameAccountsService } from "./service";

/**
 * /api/v1/game-accounts (design 03). Vaults are system-managed: there is deliberately no route to
 * add or delete one (R-GA-2 S2).
 */
export function gameAccountRoutes(accounts: GameAccountsService) {
  return new Hono<AuthedEnv>()
    .get("/", async (c) => c.json(await accounts.listAccounts(c.get("user").id), 200))
    .post("/", validate("json", createGameAccountInput), async (c) =>
      c.json(await accounts.createAccount(c.get("user").id, c.req.valid("json")), 201),
    )
    .get("/:id", validate("param", idParam), async (c) =>
      c.json(await accounts.getAccount(c.get("user").id, c.req.valid("param").id), 200),
    )
    .patch(
      "/:id",
      validate("param", idParam),
      validate("json", updateGameAccountInput),
      async (c) =>
        c.json(
          await accounts.updateAccount(
            c.get("user").id,
            c.req.valid("param").id,
            c.req.valid("json"),
          ),
          200,
        ),
    )
    .delete("/:id", validate("param", idParam), async (c) => {
      await accounts.deleteAccount(c.get("user").id, c.req.valid("param").id);
      return c.body(null, 204);
    })
    .get("/:id/characters", validate("param", idParam), async (c) =>
      c.json(await accounts.listCharacters(c.get("user").id, c.req.valid("param").id), 200),
    )
    .post(
      "/:id/characters",
      validate("param", idParam),
      validate("json", createCharacterInput),
      async (c) =>
        c.json(
          await accounts.createCharacter(
            c.get("user").id,
            c.req.valid("param").id,
            c.req.valid("json"),
          ),
          201,
        ),
    )
    .get("/:id/storage", validate("param", idParam), async (c) =>
      c.json(await accounts.getStorage(c.get("user").id, c.req.valid("param").id), 200),
    );
}

/** /api/v1/characters/:id. */
export function characterRoutes(accounts: GameAccountsService) {
  return new Hono<AuthedEnv>()
    .patch("/:id", validate("param", idParam), validate("json", updateCharacterInput), async (c) =>
      c.json(
        await accounts.updateCharacter(
          c.get("user").id,
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
        200,
      ),
    )
    .delete("/:id", validate("param", idParam), async (c) => {
      await accounts.deleteCharacter(c.get("user").id, c.req.valid("param").id);
      return c.body(null, 204);
    });
}
