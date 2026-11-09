export const ERROR_CODE = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  CONFLICT: "CONFLICT",
  REFERENCED: "REFERENCED",
  STORAGE_NOT_EMPTY: "STORAGE_NOT_EMPTY",
  ITEM_INACTIVE: "ITEM_INACTIVE",
  VAULT_OVER_LIMIT: "VAULT_OVER_LIMIT",
  UPLOAD_REJECTED: "UPLOAD_REJECTED",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export interface ApiErrorDetail {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId: string;
}

export interface ApiErrorBody {
  error: ApiErrorDetail;
}

const ERROR_CODES: ReadonlySet<string> = new Set(Object.values(ERROR_CODE));

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && ERROR_CODES.has(value);
}
