/**
 * Public type surface for the typed RPC client (ADR1). packages/api-client imports this with
 * `import type` only, so no API runtime code ever reaches a client bundle.
 * Feature routers are chained under /api/v1 in app.ts as they land, which keeps this inferred.
 */
export type { App as AppType } from "./app";
