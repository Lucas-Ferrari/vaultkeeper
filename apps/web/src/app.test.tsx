import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createAppRouter } from "./router";

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("root route", () => {
  it("renders the page inside the shell with the disclaimer footer (R-DOC-2 S1)", async () => {
    renderAt("/");

    expect(await screen.findByRole("heading", { name: "Vaultkeeper" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "Not affiliated with Webzen or MEGADEV",
    );
  });
});
