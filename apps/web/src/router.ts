import type { QueryClient } from "@tanstack/react-query";
import { createRouter, type RouterHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export interface AppRouterOptions {
  queryClient: QueryClient;
  /** Override for tests (createMemoryHistory). Defaults to browser history. */
  history?: RouterHistory;
}

export function createAppRouter({ queryClient, history }: AppRouterOptions) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    // Loaders use ensureQueryData; TanStack Query owns caching, so the router never goes stale.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    ...(history === undefined ? {} : { history }),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
