import type { AppType } from "@vaultkeeper/api/app-type";
import { hc } from "hono/client";

export { ApiError, isApiErrorBody, unwrap, type ApiErrorInit, type SuccessBody } from "./errors";

export type ApiClient = ReturnType<typeof hc<AppType>>;

export interface ApiClientOptions {
  /** Custom fetch (tests, React Native). Defaults to the global fetch. */
  fetch?: typeof fetch;
}

/**
 * Typed RPC client over the API routes (ADR1). Cookies are always sent (`credentials: "include"`)
 * because auth is a Better Auth session cookie. `baseUrl` is the API origin ("" = same origin).
 */
export function createApiClient(baseUrl: string, options: ApiClientOptions = {}): ApiClient {
  return hc<AppType>(baseUrl, {
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    init: { credentials: "include" },
  });
}
