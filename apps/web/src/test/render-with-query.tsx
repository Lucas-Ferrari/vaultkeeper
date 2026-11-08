import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createQueryClient } from "../shared/lib/query-client";
import type { ReactNode } from "react";

/** Renders a container with a fresh QueryClient (no router), for feature-level tests. */
export function renderWithQuery(ui: ReactNode) {
  const queryClient = createQueryClient({ queries: { retry: false } });
  const view = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...view, queryClient };
}
