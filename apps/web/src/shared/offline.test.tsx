import { onlineManager } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAuthApi } from "../test/fake-auth-api";
import { fakeCatalogApi, type FakeCatalogApi } from "../test/fake-catalog-api";
import { server } from "../test/msw-server";
import { fakeStockApi, type FakeStockApi } from "../test/fake-stock-api";
import { renderApp } from "../test/render-app";
import { createQueryClient, OfflineError } from "./lib/query-client";

const OFFLINE_BANNER = "You are offline, data may be stale";

function goOffline() {
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
}

function goOnline() {
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
}

afterEach(() => {
  // onlineManager is a module singleton: never leak "offline" into other tests.
  onlineManager.setOnline(true);
});

describe("offline mode (R-PWA-3)", () => {
  let catalog: FakeCatalogApi;
  let stock: FakeStockApi;

  beforeEach(() => {
    const auth = fakeAuthApi();
    catalog = fakeCatalogApi();
    stock = fakeStockApi(catalog);
    server.use(...auth.handlers, ...catalog.handlers, ...stock.handlers);
    auth.addAccount({}, { signedIn: true });
    catalog.addItem({ name: "Wings of Storm", referencePriceMc: "100.00" });
    stock.addAccount("Main");
  });

  it("shows an offline banner and keeps previously loaded data visible", async () => {
    renderApp("/stock/new");
    await screen.findByRole("heading", { name: "Add stock" });
    expect(screen.queryByText(new RegExp(OFFLINE_BANNER))).not.toBeInTheDocument();

    goOffline();

    expect(screen.getByRole("status", { name: "Connection" })).toHaveTextContent(OFFLINE_BANNER);
    expect(screen.getByRole("heading", { name: "Add stock" })).toBeInTheDocument();
  });

  it("S2: disables save with a clear message and sends or queues nothing", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderApp("/stock/new");
    const save = await screen.findByRole("button", { name: "Save entry" });

    goOffline();

    expect(save).toBeDisabled();
    expect(screen.getByRole("status", { name: "Connection" })).toHaveTextContent(
      "Saving is disabled until you reconnect",
    );
    await user.click(save);
    expect(stock.calls.stockCreates).toHaveLength(0);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("S3: back online clears the banner and refetches stale data", async () => {
    const { queryClient } = renderApp("/stock");
    await waitFor(() => expect(stock.calls.stockList.length).toBeGreaterThan(0));
    goOffline();
    const before = stock.calls.stockList.length;
    // Data loaded before going offline is stale by the time we reconnect.
    await act(() => queryClient.invalidateQueries({ refetchType: "none" }));

    goOnline();

    expect(screen.queryByText(new RegExp(OFFLINE_BANNER))).not.toBeInTheDocument();
    await waitFor(() => expect(stock.calls.stockList.length).toBeGreaterThan(before));
  });
});

describe("createQueryClient mutation guard (R-PWA-3 S2)", () => {
  it("fails offline mutations immediately: no request, nothing paused or queued", async () => {
    const queryClient = createQueryClient();
    const mutationFn = vi.fn(async () => "saved");
    onlineManager.setOnline(false);

    const run = queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn })
      .execute(undefined);

    await expect(run).rejects.toBeInstanceOf(OfflineError);
    expect(mutationFn).not.toHaveBeenCalled();
    expect(
      queryClient
        .getMutationCache()
        .getAll()
        .some((m) => m.state.isPaused),
    ).toBe(false);
  });

  it("runs mutations normally while online", async () => {
    const queryClient = createQueryClient();
    const mutationFn = vi.fn(async () => "saved");

    const run = queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn })
      .execute(undefined);

    await expect(run).resolves.toBe("saved");
  });
});
