import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { createQueryClient } from "../shared/lib/query-client";
import { createAppRouter } from "../router";

/** The real router (all file routes + guards) in memory, with a fresh QueryClient per test. */
export function renderApp(path: string) {
  const queryClient = createQueryClient({ queries: { retry: false } });
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient };
}

/** Current pathname + search as the user would see it in the address bar. */
export function currentHref(router: ReturnType<typeof renderApp>["router"]): string {
  return router.state.location.href;
}
