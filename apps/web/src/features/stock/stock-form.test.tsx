import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAuthApi } from "../../test/fake-auth-api";
import { fakeCatalogApi, type FakeCatalogApi } from "../../test/fake-catalog-api";
import { server } from "../../test/msw-server";
import { fakeStockApi, type FakeStockApi } from "../../test/fake-stock-api";
import { renderApp } from "../../test/render-app";
import { valuationKeys } from "../dashboard/api/keys";
import { groupKeys } from "../groups/api/keys";
import { accountKeys } from "../accounts/api/keys";
import { stockKeys } from "./api/keys";

describe("stock form (task 4.11)", () => {
  let catalog: FakeCatalogApi;
  let stock: FakeStockApi;
  let mainId: string;

  beforeEach(() => {
    const auth = fakeAuthApi();
    catalog = fakeCatalogApi();
    stock = fakeStockApi(catalog);
    server.use(...auth.handlers, ...catalog.handlers, ...stock.handlers);
    auth.addAccount({}, { signedIn: true });
    catalog.addItem({ name: "Wings of Storm", referencePriceMc: "100.00" });
    mainId = stock.addAccount("Main").id;
    stock.addVault(mainId, 11);
  });

  async function pickStorm(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByRole("combobox", { name: "Item" }), "storm");
    await user.click(await screen.findByRole("option", { name: /Wings of Storm/ }));
    expect(await screen.findByText(/Selected: Wings of Storm/)).toBeInTheDocument();
  }

  it("location select lists own locations; over-limit vaults are disabled", async () => {
    renderApp("/stock/new");
    const select = await screen.findByLabelText("Location");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Main · Vault 3" })).toBeInTheDocument(),
    );
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Main · Vault 11/ })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Main · Vault 1" })).toBeEnabled();
  });

  it("shows shared-schema errors (level 16, qty 0, options > 500) and sends nothing", async () => {
    const user = userEvent.setup();
    renderApp("/stock/new");
    await pickStorm(user);
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Main · Vault 3" })).toBeInTheDocument(),
    );
    await user.selectOptions(screen.getByLabelText("Location"), "Main · Vault 3");

    const level = screen.getByLabelText("Level");
    await user.clear(level);
    await user.type(level, "16");
    const qty = screen.getByLabelText("Quantity");
    await user.clear(qty);
    await user.type(qty, "0");
    await user.click(screen.getByLabelText("Options"));
    await user.paste("x".repeat(501));
    await user.click(screen.getByRole("button", { name: "Save entry" }));

    expect(await screen.findByText(/<=15/)).toBeInTheDocument();
    expect(screen.getByText(/>=1/)).toBeInTheDocument();
    expect(screen.getByText("Use at most 500 characters")).toBeInTheDocument();
    expect(level).toHaveAttribute("aria-invalid", "true");
    expect(stock.calls.stockCreates).toHaveLength(0);
  });

  it("submits POST /stock, invalidates the design-13 keys and returns to the list", async () => {
    const user = userEvent.setup();
    const { router, queryClient } = renderApp("/stock/new");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await pickStorm(user);
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Main · Vault 3" })).toBeInTheDocument(),
    );
    await user.selectOptions(screen.getByLabelText("Location"), "Main · Vault 3");
    const level = screen.getByLabelText("Level");
    await user.clear(level);
    await user.type(level, "13");
    await user.type(screen.getByLabelText("Options"), "+Luck");
    await user.click(screen.getByRole("button", { name: "Save entry" }));

    await waitFor(() => expect(stock.calls.stockCreates).toHaveLength(1));
    expect(stock.calls.stockCreates[0]).toEqual({
      catalogItemId: catalog.items[0]?.id,
      storageLocationId: stock.locationIdOf(mainId, "Vault 3"),
      level: 13,
      quantity: 1,
      options: "+Luck",
      priceMc: null,
      notes: null,
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/stock"));
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        stockKeys.all,
        accountKeys.storageAll(),
        groupKeys.all,
        valuationKeys.all,
      ]),
    );
  });

  it("edit page loads the entry and PATCHes changed fields", async () => {
    const user = userEvent.setup();
    const entry = stock.addEntry(catalog.items[0]!, stock.locationIdOf(mainId, "Vault 1"), {
      quantity: 2,
    });
    renderApp(`/stock/${entry.id}`);
    const qty = await screen.findByLabelText("Quantity");
    await waitFor(() => expect(qty).toHaveValue("2"));
    expect(screen.getByText(/Selected: Wings of Storm/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
    await user.clear(qty);
    await user.type(qty, "5");
    await user.click(screen.getByRole("button", { name: "Save entry" }));
    await waitFor(() => expect(stock.calls.stockPatches).toHaveLength(1));
    expect(stock.calls.stockPatches[0]?.body).toMatchObject({ quantity: 5 });
  });
});
