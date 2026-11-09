import { ApiError } from "@vaultkeeper/api-client";
import { ERROR_CODE } from "@vaultkeeper/shared/errors";

/** Message for a failed admin catalog call; server messages are already user-facing. */
export function adminErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === ERROR_CODE.REFERENCED) {
      return "This item is in use by stock entries, so it cannot be deleted. Deactivate it instead.";
    }
    if (error.code === ERROR_CODE.CONFLICT) {
      return "An item with this name already exists in this category.";
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

/** Upload failures (R-CAT-6 S2): size and type are explained, not just coded. */
export function imageErrorMessage(error: unknown, maxLabel: string): string {
  if (error instanceof ApiError) {
    if (error.code === ERROR_CODE.PAYLOAD_TOO_LARGE) {
      return `That image is too large. The limit is ${maxLabel}.`;
    }
    if (error.code === ERROR_CODE.UPLOAD_REJECTED) {
      return `That file was rejected: ${error.message}. Use a png, jpeg or webp image.`;
    }
  }
  return adminErrorMessage(error);
}
