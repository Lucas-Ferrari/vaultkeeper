import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw-server";

// The full suite runs ~60 files in parallel: the 1 s default for findBy/waitFor flaked under that
// load (route loaders + MSW + refetches). Still fails fast enough on real regressions.
configure({ asyncUtilTimeout: 3000 });

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
