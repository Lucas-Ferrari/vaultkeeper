import { ApiError } from "@vaultkeeper/api-client";
import { ERROR_CODE } from "@vaultkeeper/shared/errors";

/** Message for a failed stock call: domain 422s explained, server text otherwise. */
export function stockErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === ERROR_CODE.VAULT_OVER_LIMIT) {
      return "That vault is over the vault limit: it can only be emptied. Pick another location.";
    }
    if (error.code === ERROR_CODE.ITEM_INACTIVE) {
      return "That item is no longer in the catalog. Pick another one.";
    }
    if (error.code === ERROR_CODE.NOT_FOUND) return "Not found. It may have been deleted.";
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
