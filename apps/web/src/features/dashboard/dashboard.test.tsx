import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeAuthApi } from "../../test/fake-auth-api";
import { fakeCatalogApi, type FakeCatalogApi } from "../../test/fake-catalog-api";
import { fakeStockApi, type FakeStockApi } from "../../test/fake-stock-api";
import { fakeValuationApi } from "../../test/fake-valuation-api";
import { server } from "../../test/msw-server";
import { renderApp } from "../../test/render-app";

describe("dashboard (task 5.9, R-VAL-2, R-VAL-3)", () => {
  let catalog: FakeCatalogApi;
  let stock: FakeStockApi;

  beforeEach(() => {
    const auth = fakeAuthApi();
    catalog = fakeCatalogApi();
    stock = fakeStockApi(catalog);
    const valuation = fakeValuationApi(stock);
    server.use(...auth.handlers, ...catalog.handlers, ...stock.handlers, ...valuation.handlers);
    auth.addAccount({}, { signedIn: true });
  });

  const region = (name: string) => screen.findByRole("region", { name });

  it("empty user: zeros, no partial marker", async () => {
    renderApp("/");
    const totals = await region("Total value");
    expect(within(totals).getByTestId("total-mc")).toHaveTextContent("0.00");
    expect(within(totals).getByTestId("total-mp")).toHaveTextContent("0.00");
    expect(within(totals).queryByText(/without price/)).not.toBeInTheDocument();
    expect(within(totals).queryByText(/Partial/)).not.toBeInTheDocument();
  });

  it("total MC + MP with 2 decimals, partial badge, per-account and per-location rows", async () => {
    const main = stock.addAccount("Main");
    const alt = stock.addAccount("Alt");
    stock.addCharacter(main.id, "DarkLord");
    const storm = catalog.addItem({ name: "Wings of Storm", referencePriceMc: "100.00" });
    const nothing = catalog.addItem({ name: "Wings of Nothing" });
    stock.addEntry(storm, stock.locationIdOf(main.id, "Vault 2"), { quantity: 3 });
    stock.addEntry(nothing, stock.locationIdOf(main.id, "Vault 2"));
    stock.addEntry(nothing, stock.locationIdOf(main.id, "Inventory – DarkLord"));
    stock.addEntry(storm, stock.locationIdOf(alt.id, "Vault 1"), { quantity: 10 });
    renderApp("/");

    const totals = await region("Total value");
    expect(within(totals).getByTestId("total-mc")).toHaveTextContent("1,300.00");
    expect(within(totals).getByTestId("total-mp")).toHaveTextContent("9,750.00");
    expect(within(totals).getByText("2 items without price")).toBeInTheDocument();
    expect(within(totals).getByText("Partial total")).toBeInTheDocument();

    const accounts = await region("By account");
    const accountRows = within(accounts).getAllByRole("row").slice(1);
    expect(accountRows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Alt"),
      expect.stringContaining("Main"),
    ]);
    expect(accountRows[1]).toHaveTextContent("300.00");
    expect(accountRows[1]).toHaveTextContent("2,250.00");
    expect(accountRows[1]).toHaveTextContent("2 without price");

    const locations = await region("By location");
    const inventory = within(locations).getByText("Main · Inventory – DarkLord").closest("tr");
    // Only unpriced items: shown as "-", never 0.
    expect(within(inventory as HTMLElement).getByTestId("location-mc")).toHaveTextContent(/^-$/);
    const vault2 = within(locations).getByText("Main · Vault 2").closest("tr");
    expect(within(vault2 as HTMLElement).getByTestId("location-mc")).toHaveTextContent("300.00");
  });
});
