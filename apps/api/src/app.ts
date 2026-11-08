import { CSV_MAX_BYTES, UPLOAD_MAX_BYTES } from "@vaultkeeper/shared/constants";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { Auth } from "./auth/auth";
import { requireUser, sessionMiddleware } from "./auth/middleware";
import type { Database } from "./db/client";
import { catalogImportRoutes } from "./features/catalog-import/routes";
import { createCatalogImportService } from "./features/catalog-import/service";
import { catalogImageRoutes } from "./features/catalog-images/routes";
import { createCatalogImageService } from "./features/catalog-images/service";
import { adminCatalogRoutes, catalogRoutes } from "./features/catalog/routes";
import { createCatalogService } from "./features/catalog/service";
import { healthRoutes } from "./features/health/routes";
import { mediaRoutes } from "./features/media/routes";
import { meRoutes } from "./features/me/routes";
import { jsonBodyLimit } from "./shared/http/body-limit";
import {
  createErrorHandler,
  notFoundHandler,
  type ErrorHandlerOptions,
} from "./shared/http/on-error";
import type { StorageAdapter } from "./storage/storage-adapter";

export interface HealthResponse {
  status: "ok";
}

/** Upload size limits (design 15: UPLOAD_MAX_BYTES / CSV_MAX_BYTES env vars). */
export interface UploadLimits {
  uploadMaxBytes: number;
  csvMaxBytes: number;
}

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  uploadMaxBytes: UPLOAD_MAX_BYTES,
  csvMaxBytes: CSV_MAX_BYTES,
};

export interface AppDeps {
  auth: Auth;
  db: Database;
  /** Item image storage (ADR17): LocalDiskAdapter on MEDIA_DIR in server.ts, a temp dir in tests. */
  storage: StorageAdapter;
  /** Default: the shared constants (1 MiB image, 2 MiB CSV); server.ts passes the env values. */
  limits?: UploadLimits;
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
  const { auth, db, storage, limits = DEFAULT_UPLOAD_LIMITS } = deps;
  const catalog = createCatalogService({ db, storage });
  const catalogImages = createCatalogImageService({
    db,
    storage,
    maxBytes: limits.uploadMaxBytes,
  });
  const catalogImport = createCatalogImportService({ db, maxBytes: limits.csvMaxBytes });

  const v1 = new Hono()
    .use(sessionMiddleware(auth))
    .use(requireUser)
    .route("/me", meRoutes())
    .route("/catalog", catalogRoutes(catalog))
    .route("/admin/catalog", adminCatalogRoutes(catalog))
    .route("/admin/catalog", catalogImageRoutes(catalogImages, limits.uploadMaxBytes))
    .route("/admin/catalog", catalogImportRoutes(catalogImport, limits.csvMaxBytes));

  const app = new Hono()
    .use(requestId())
    .use(logger(deps.log))
    .use(secureHeaders())
    .use("/api/auth/*", jsonBodyLimit)
    .use("/api/v1/*", jsonBodyLimit)
    .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
    .route("/healthz", healthRoutes(db))
    .route("/media", mediaRoutes(storage))
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
