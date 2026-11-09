import { ERROR_CODE, type ApiErrorBody, type ErrorCode } from "@vaultkeeper/shared/errors";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface AppErrorInit {
  code: ErrorCode;
  status: ContentfulStatusCode;
  message: string;
  details?: unknown;
}

/**
 * Expected, client-facing failure (design 02). Services throw it; app.onError turns it into the
 * envelope `{ error: { code, message, details?, requestId } }` with `status`.
 */
export class AppError extends Error {
  override readonly name: string = "AppError";
  readonly code: ErrorCode;
  readonly status: ContentfulStatusCode;
  readonly details: unknown;

  constructor(init: AppErrorInit) {
    super(init.message);
    this.code = init.code;
    this.status = init.status;
    this.details = init.details;
  }
}

export class UnauthenticatedError extends AppError {
  override readonly name = "UnauthenticatedError";
  constructor(message = "Authentication required") {
    super({ code: ERROR_CODE.UNAUTHENTICATED, status: 401, message });
  }
}

export class ForbiddenError extends AppError {
  override readonly name = "ForbiddenError";
  constructor(message = "You are not allowed to do this") {
    super({ code: ERROR_CODE.FORBIDDEN, status: 403, message });
  }
}

/** Also used for other users' resources: 404, never 403, so ids cannot be probed (R-AUTH-5). */
export class NotFoundError extends AppError {
  override readonly name = "NotFoundError";
  constructor(message = "Not found") {
    super({ code: ERROR_CODE.NOT_FOUND, status: 404, message });
  }
}

export class ConflictError extends AppError {
  override readonly name = "ConflictError";
  constructor(message = "Conflicts with existing data", details?: unknown) {
    super({ code: ERROR_CODE.CONFLICT, status: 409, message, details });
  }
}

export class ValidationError extends AppError {
  override readonly name = "ValidationError";
  constructor(message = "Invalid input", details?: unknown) {
    super({ code: ERROR_CODE.VALIDATION_FAILED, status: 422, message, details });
  }
}

/** Request id set by hono/request-id; "unknown" only if a failure happens before it ran. */
export function requestIdOf(c: Context): string {
  return c.get("requestId") ?? "unknown";
}

/** Renders the error envelope (the only error body shape the API emits). */
export function errorResponse(c: Context, error: AppError): Response {
  const body: ApiErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
      requestId: requestIdOf(c),
    },
  };
  return c.json(body, error.status);
}
