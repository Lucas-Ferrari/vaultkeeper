import { ApiError } from "@vaultkeeper/api-client";
import { ERROR_CODE } from "@vaultkeeper/shared/errors";
import { z } from "zod";

const countDetails = z.object({ count: z.number().int() });

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function entryCountLabel(count: number): string {
  return plural(count, "item");
}

/** Message for a failed account/character call (409s explained, server text otherwise). */
export function accountErrorMessage(error: unknown, subject = "account"): string {
  if (error instanceof ApiError) {
    if (error.code === ERROR_CODE.CONFLICT) {
      return subject === "account"
        ? "Account name already used. Pick another one."
        : "Character name already used in this account.";
    }
    if (error.code === ERROR_CODE.STORAGE_NOT_EMPTY) {
      const parsed = countDetails.safeParse(error.details);
      const what = parsed.success ? plural(parsed.data.count, "item") : "items";
      return `This ${subject} still holds ${what}. Move or delete them first.`;
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
