import { ROLE, type Role } from "@vaultkeeper/shared/constants";
import type { MeResponse } from "@vaultkeeper/shared/schemas/me";
import { Hono } from "hono";
import type { AuthedEnv } from "../../auth/middleware";

function toRole(value: string | null | undefined): Role {
  return value === ROLE.ADMIN ? ROLE.ADMIN : ROLE.USER;
}

/** Mounted under the session guard, so `user` is always present. */
export function meRoutes() {
  return new Hono<AuthedEnv>().get("/", (c) => {
    const user = c.get("user");
    const body: MeResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: toRole(user.role),
    };
    return c.json(body, 200);
  });
}
