import {
  ERROR_CODE,
  isErrorCode,
  type ApiErrorBody,
  type ApiErrorDetail,
  type ErrorCode,
} from "@vaultkeeper/shared/errors";
import type { ClientResponse } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";

export interface ApiErrorInit {
  code: ErrorCode;
  status: number;
  message: string;
  details?: unknown;
  requestId?: string;
}

/** Typed failure of any API call: the error envelope `{ error: { code, message, ... } }`. */
export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.code = init.code;
    this.status = init.status;
    this.details = init.details;
    this.requestId = init.requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiErrorDetail(value: unknown): value is ApiErrorDetail {
  return (
    isRecord(value) &&
    isErrorCode(value.code) &&
    typeof value.message === "string" &&
    typeof value.requestId === "string"
  );
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return isRecord(value) && isApiErrorDetail(value.error);
}

/** The part of a fetch Response that unwrap() needs; hono ClientResponse and Response both fit. */
export interface UnwrappableResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

type IsAny<T> = 0 extends 1 & T ? true : false;

/** Body type of the 2xx members of a hono ClientResponse union; `unknown` for a plain Response. */
export type SuccessBody<R> =
  R extends ClientResponse<infer T, infer S, infer _F>
    ? IsAny<T> extends true
      ? unknown
      : S extends SuccessStatusCode
        ? T
        : never
    : unknown;

const NO_CONTENT = new Set([204, 205]);

async function readJson(response: UnwrappableResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function toApiError(response: UnwrappableResponse, body: unknown): ApiError {
  if (isApiErrorBody(body)) {
    const { code, message, details, requestId } = body.error;
    return new ApiError({ code, status: response.status, message, details, requestId });
  }
  return new ApiError({
    code: ERROR_CODE.INTERNAL,
    status: response.status,
    message: response.statusText || `Request failed with status ${response.status}`,
  });
}

/**
 * Resolves a typed API call to its success body, or throws ApiError.
 *   const stock = await unwrap(api.api.v1.stock.$get());
 */
export async function unwrap<R extends UnwrappableResponse>(
  response: R | Promise<R>,
): Promise<SuccessBody<R>> {
  const res = await response;
  if (!res.ok) {
    throw toApiError(res, await readJson(res));
  }
  if (NO_CONTENT.has(res.status)) {
    return undefined as SuccessBody<R>;
  }
  return (await res.json()) as SuccessBody<R>;
}
