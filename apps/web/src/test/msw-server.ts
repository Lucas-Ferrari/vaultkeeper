import type { AnyHandler } from "msw";
import { setupServer } from "msw/node";

/**
 * Default API handlers for web tests (design 16): containers hit MSW, never a real API.
 * Per-test overrides: server.use(http.get("/api/v1/...", () => HttpResponse.json(...))).
 * Response bodies should be typed with the shared schemas so mocks match the contract.
 */
export const handlers: AnyHandler[] = [];

export const server = setupServer(...handlers);
