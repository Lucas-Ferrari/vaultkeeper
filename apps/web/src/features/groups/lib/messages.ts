import { ApiError } from "@vaultkeeper/api-client";
import { ERROR_CODE } from "@vaultkeeper/shared/errors";

/** Message for a failed group call (409 explained, server text otherwise). */
export function groupErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === ERROR_CODE.CONFLICT) return "Group name already used. Pick another one.";
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
