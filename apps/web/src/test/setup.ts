import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw-server";

// jsdom does not implement scrolling; the router's scroll restoration calls it.
window.scrollTo = () => {};

// Any request without a handler fails the test: no accidental network access.
// (MSW 3 renamed v2's onUnhandledRequest to onUnhandledFrame.)
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
