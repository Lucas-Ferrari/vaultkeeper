import { ERROR_CODE, type ErrorCode } from "@vaultkeeper/shared/errors";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError, errorResponse, NotFoundError } from "./errors";

/** Postgres SQLSTATEs that are expected outcomes of user input, not bugs (design 02). */
export const PG_ERROR = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
} as const;

const PG_ERROR_MAP: Readonly<Record<string, () => AppError>> = {
  [PG_ERROR.UNIQUE_VIOLATION]: () =>
    new AppError({
      code: ERROR_CODE.CONFLICT,
      status: 409,
      message: "Conflicts with existing data",
    }),
  [PG_ERROR.FOREIGN_KEY_VIOLATION]: () =>
    new AppError({
      code: ERROR_CODE.REFERENCED,
      status: 409,
      message: "Referenced by or referencing other data",
    }),
  [PG_ERROR.CHECK_VIOLATION]: () =>
    new AppError({
      code: ERROR_CODE.VALIDATION_FAILED,
      status: 422,
      message: "Value out of the allowed range",
    }),
};

const HTTP_STATUS_CODE: Readonly<Partial<Record<number, ErrorCode>>> = {
  400: ERROR_CODE.VALIDATION_FAILED,
  401: ERROR_CODE.UNAUTHENTICATED,
  403: ERROR_CODE.FORBIDDEN,
  404: ERROR_CODE.NOT_FOUND,
  409: ERROR_CODE.CONFLICT,
  413: ERROR_CODE.PAYLOAD_TOO_LARGE,
  422: ERROR_CODE.VALIDATION_FAILED,
};

const MAX_CAUSE_DEPTH = 5;

/** SQLSTATE of a node-postgres error, also when wrapped (Drizzle's DrizzleQueryError.cause). */
function pgCodeOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current instanceof Error; depth += 1) {
    const code: unknown = (current as Error & { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = current.cause;
  }
  return undefined;
}

function fromHttpException(error: HTTPException): AppError {
  return new AppError({
    code: HTTP_STATUS_CODE[error.status] ?? ERROR_CODE.INTERNAL,
    status: error.status as ContentfulStatusCode,
    message: error.message,
  });
}

const INTERNAL = (): AppError =>
  new AppError({ code: ERROR_CODE.INTERNAL, status: 500, message: "Internal server error" });

export interface ErrorHandlerOptions {
  /** Receives every unexpected failure (500). Default: console.error. */
  onUnexpected?: (error: unknown, c: Context) => void;
}

/**
 * app.onError (design 02): AppError -> envelope; HTTPException with its own response passes
 * through, otherwise becomes an envelope; known pg constraint violations -> 409/422; anything else
 * -> 500 INTERNAL, logged, with nothing from the error (message, SQL, stack) in the body.
 */
export function createErrorHandler(options: ErrorHandlerOptions = {}): ErrorHandler {
  const onUnexpected =
    options.onUnexpected ??
    ((error: unknown) => {
      console.error(error);
    });

  return (error, c) => {
    if (error instanceof AppError) return errorResponse(c, error);
    if (error instanceof HTTPException) {
      return error.res ? error.getResponse() : errorResponse(c, fromHttpException(error));
    }
    const pgCode = pgCodeOf(error);
    const mapped = pgCode === undefined ? undefined : PG_ERROR_MAP[pgCode];
    if (mapped) return errorResponse(c, mapped());

    onUnexpected(error, c);
    return errorResponse(c, INTERNAL());
  };
}

export const notFoundHandler: NotFoundHandler = (c) => errorResponse(c, new NotFoundError());
