import { createApiClient } from "@vaultkeeper/api-client";

/** Typed API client (ADR1). VITE_API_URL empty = same origin. */
export const api = createApiClient(import.meta.env.VITE_API_URL || window.location.origin);
