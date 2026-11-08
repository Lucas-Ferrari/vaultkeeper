import { CSV_MAX_BYTES, UPLOAD_MAX_BYTES } from "@vaultkeeper/shared/constants";
import { ERROR_CODE } from "@vaultkeeper/shared/errors";
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AppError, errorResponse } from "./errors";

/** Per route group limits (design 02); multipart groups add 16 KB for form overhead. */
export const JSON_BODY_LIMIT_BYTES = 64 * 1024;
const MULTIPART_OVERHEAD_BYTES = 16 * 1024;
export const IMAGE_BODY_LIMIT_BYTES = UPLOAD_MAX_BYTES + MULTIPART_OVERHEAD_BYTES;
export const CSV_BODY_LIMIT_BYTES = CSV_MAX_BYTES + MULTIPART_OVERHEAD_BYTES;

export function limitBody(maxSize: number): MiddlewareHandler {
  return bodyLimit({
    maxSize,
    onError: (c) =>
      errorResponse(
        c,
        new AppError({
          code: ERROR_CODE.PAYLOAD_TOO_LARGE,
          status: 413,
          message: `Request body exceeds ${maxSize} bytes`,
        }),
      ),
  });
}

const jsonLimit = limitBody(JSON_BODY_LIMIT_BYTES);

/**
 * The JSON limit for a whole route group. Multipart requests skip it: upload routes (images, CSV)
 * mount their own, larger limitBody() — a single global limit would reject every upload first.
 */
export const jsonBodyLimit: MiddlewareHandler = async (c, next) => {
  if (c.req.header("content-type")?.startsWith("multipart/form-data")) return next();
  return jsonLimit(c, next);
};
