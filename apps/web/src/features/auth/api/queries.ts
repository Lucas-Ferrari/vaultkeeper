import { queryOptions } from "@tanstack/react-query";
import { ApiError, unwrap } from "@vaultkeeper/api-client";
import { ERROR_CODE } from "@vaultkeeper/shared/errors";
import type { MeResponse } from "@vaultkeeper/shared/schemas/me";
import { api } from "../../../shared/lib/api";
import { meKeys } from "./keys";

/** The signed-in user, or null when there is no valid session (401). Other failures throw. */
export async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await unwrap(api.api.v1.me.$get());
  } catch (error) {
    if (error instanceof ApiError && error.code === ERROR_CODE.UNAUTHENTICATED) return null;
    throw error;
  }
}

/**
 * Session query (GET /api/v1/me). Route guards read it with ensureQueryData; the auth mutations
 * clear the whole cache so the next guard run asks the server again.
 */
export const sessionQueryOptions = queryOptions({
  queryKey: meKeys.all,
  queryFn: fetchMe,
  staleTime: 30_000,
});
