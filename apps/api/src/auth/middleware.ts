import { ROLE } from "@vaultkeeper/shared/constants";
import { createMiddleware } from "hono/factory";
import { ForbiddenError, UnauthenticatedError } from "../shared/http/errors";
import type { Auth, AuthSession, AuthUser } from "./auth";

/** Set by sessionMiddleware on every guarded request: null when there is no valid session. */
export interface SessionVariables {
  user: AuthUser | null;
  session: AuthSession | null;
}

export interface SessionEnv {
  Variables: SessionVariables;
}

/** After requireUser the session is guaranteed. */
export interface AuthedVariables {
  user: AuthUser;
  session: AuthSession;
}

export interface AuthedEnv {
  Variables: AuthedVariables;
}

/** Resolves the Better Auth session from the request cookies (one DB read: no cookie cache). */
export function sessionMiddleware(auth: Auth) {
  return createMiddleware<SessionEnv>(async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", result?.user ?? null);
    c.set("session", result?.session ?? null);
    await next();
  });
}

/** 401 UNAUTHENTICATED without a valid session (R-AUTH-2). */
export const requireUser = createMiddleware<AuthedEnv & SessionEnv>(async (c, next) => {
  const user = c.get("user");
  const session = c.get("session");
  if (!user || !session) throw new UnauthenticatedError();
  c.set("user", user);
  c.set("session", session);
  await next();
});

/** 403 FORBIDDEN unless the signed-in user is an admin. Mount after requireUser. */
export const requireAdmin = createMiddleware<AuthedEnv>(async (c, next) => {
  if (c.get("user").role !== ROLE.ADMIN) throw new ForbiddenError();
  await next();
});
