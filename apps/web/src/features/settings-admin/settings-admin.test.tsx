import { ROLE } from "@vaultkeeper/shared/constants";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { valuationKeys } from "../dashboard/api/keys";
import { accountKeys } from "../accounts/api/keys";
import { settingsKeys } from "./api/keys";
import { fakeAuthApi } from "../../test/fake-auth-api";
import { fakeCatalogApi } from "../../test/fake-catalog-api";
import { fakeStockApi } from "../../test/fake-stock-api";
import { fakeValuationApi, type FakeValuationApi } from "../../test/fake-valuation-api";
import { server } from "../../test/msw-server";
import { renderApp } from "../../test/render-app";

describe("admin settings page (task 5.11, R-SET-1..3)", () => {
  let valuation: FakeValuationApi;

  beforeEach(() => {
    const auth = fakeAuthApi();
    const catalog = fakeCatalogApi();
    const stock = fakeStockApi(catalog);
    valuation = fakeValuationApi(stock);
    server.use(...auth.handlers, ...catalog.handlers, ...stock.handlers, ...valuation.handlers);
    auth.addAccount({ role: ROLE.ADMIN }, { signedIn: true });
  });

  const rate = () => screen.getByLabelText("MC to MP rate");
  const vaults = () => screen.getByLabelText("Vaults per account");
  const save = () => screen.getByRole("button", { name: "Save settings" });

  it("loads current values", async () => {
    renderApp("/settings");
    await waitFor(() => expect(rate()).toHaveValue("7.5"));
    expect(vaults()).toHaveValue(10);
  });

  it("validates with the shared schema (rate > 0, vault_count 1..50 int), nothing sent", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await waitFor(() => expect(rate()).toHaveValue("7.5"));
    await user.clear(rate());
    await user.type(rate(), "0");
    await user.clear(vaults());
    await user.type(vaults(), "51");
    await user.click(save());
    expect(await screen.findByText("Must be greater than 0")).toBeInTheDocument();
    expect(screen.getByText("Use at most 50")).toBeInTheDocument();
    expect(valuation.calls.settingsPatches).toEqual([]);
  });

  it("shows a server 422 on the field", async () => {
    const user = userEvent.setup();
    valuation.rejectNextSettings("vaultCount", "Rejected by server");
    renderApp("/settings");
    await waitFor(() => expect(vaults()).toHaveValue(10));
    await user.click(save());
    expect(await screen.findByText("Rejected by server")).toBeInTheDocument();
  });

  it("success saves changed values and invalidates settings, valuation and accounts", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderApp("/settings");
    await waitFor(() => expect(rate()).toHaveValue("7.5"));
    queryClient.setQueryData([...valuationKeys.all, "probe"], 1);
    queryClient.setQueryData([...accountKeys.all, "probe"], 1);
    await user.clear(rate());
    await user.type(rate(), "8");
    await user.clear(vaults());
    await user.type(vaults(), "8");
    await user.click(save());

    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
    expect(valuation.calls.settingsPatches).toEqual([{ mcToMpRate: "8", vaultCount: 8 }]);
    expect(queryClient.getQueryState([...valuationKeys.all, "probe"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState([...accountKeys.all, "probe"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(settingsKeys.all)).toMatchObject({ mcToMpRate: "8.0000" });
  });

  it("a plain user cannot open it (redirected by the admin guard)", async () => {
    const auth = fakeAuthApi();
    server.use(...auth.handlers);
    auth.addAccount({}, { signedIn: true });
    renderApp("/settings");
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
});
