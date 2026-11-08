import { Hono } from "hono";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { Auth } from "./auth/auth";
import { requireUser, sessionMiddleware } from "./auth/middleware";
import type { Database } from "./db/client";
import { adminCatalogRoutes, catalogRoutes } from "./features/catalog/routes";
import { createCatalogService } from "./features/catalog/service";
import { healthRoutes } from "./features/health/routes";
import { meRoutes } from "./features/me/routes";
import { jsonBodyLimit } from "./shared/http/body-limit";
import {
  createErrorHandler,
  notFoundHandler,
  type ErrorHandlerOptions,
} from "./shared/http/on-error";

export interface HealthResponse {
  status: "ok";
}

export interface AppDeps {
  auth: Auth;
  db: Database;
  /** Access log line printer (hono/logger). Default: console.log; tests pass a no-op. */
  log?: (line: string) => void;
  onUnexpectedError?: ErrorHandlerOptions["onUnexpected"];
}

/**
 * App factory (manual DI, ADR13). Middleware order is part of the contract (design 02):
 * requestId -> logger -> secureHeaders -> per-group body limits -> /api/auth/* (Better Auth) ->
 * session guard on /api/v1/* -> chained feature routers (so AppType stays inferred).
 * onError/notFound render the error envelope.
 */
export function createApp(deps: AppDeps) {
  const { auth, db } = deps;
  const catalog = createCatalogService({ db });

  const v1 = new Hono()
    .use(sessionMiddleware(auth))
    .use(requireUser)
    .route("/me", meRoutes())
    .route("/catalog", catalogRoutes(catalog))
    .route("/admin/catalog", adminCatalogRoutes(catalog));

  const app = new Hono()
    .use(requestId())
    .use(logger(deps.log))
    .use(secureHeaders())
    .use("/api/auth/*", jsonBodyLimit)
    .use("/api/v1/*", jsonBodyLimit)
    .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
    .route("/healthz", healthRoutes(db))
    .route("/api/v1", v1);

  app.onError(
    createErrorHandler(
      deps.onUnexpectedError === undefined ? {} : { onUnexpected: deps.onUnexpectedError },
    ),
  );
  app.notFound(notFoundHandler);
  return app;
}

export type App = ReturnType<typeof createApp>;
