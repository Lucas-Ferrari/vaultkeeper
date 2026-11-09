import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeAuthApi } from "../../test/fake-auth-api";
import { fakeCatalogApi, type FakeCatalogApi } from "../../test/fake-catalog-api";
import { fakeStockApi, type FakeStockApi } from "../../test/fake-stock-api";
import { fakeValuationApi, type FakeValuationApi } from "../../test/fake-valuation-api";
import { server } from "../../test/msw-server";
import { currentHref, renderApp } from "../../test/render-app";

describe("groups UI (task 5.10, R-GRP-1..3)", () => {
  let catalog: FakeCatalogApi;
  let stock: FakeStockApi;
  let valuation: FakeValuationApi;
  let mainId: string;

  beforeEach(() => {
    const auth = fakeAuthApi();
    catalog = fakeCatalogApi();
    stock = fakeStockApi(catalog);
    valuation = fakeValuationApi(stock);
    server.use(...auth.handlers, ...catalog.handlers, ...stock.handlers, ...valuation.handlers);
    auth.addAccount({}, { signedIn: true });
    mainId = stock.addAccount("Main").id;
  });

  it("lists groups and creates one; a duplicate name shows the 409 message", async () => {
    const user = userEvent.setup();
    valuation.addGroup("Dark Phoenix Set");
    renderApp("/groups");
    expect(await screen.findByRole("link", { name: "Dark Phoenix Set" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Group name"), "dark phoenix set");
    await user.click(screen.getByRole("button", { name: "Create group" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Group name already used");

    await user.clear(screen.getByLabelText("Group name"));
    await user.type(screen.getByLabelText("Group name"), "Trade bundle");
    await user.click(screen.getByRole("button", { name: "Create group" }));
    expect(await screen.findByRole("link", { name: "Trade bundle" })).toBeInTheDocument();
    expect(screen.getByLabelText("Group name")).toHaveValue("");
  });

  it("detail lists members with location + value and totals; remove keeps the entry", async () => {
    const user = userEvent.setup();
    const storm = catalog.addItem({ name: "Wings of Storm", referencePriceMc: "250.00" });
    const nothing = catalog.addItem({ name: "Wings of Nothing" });
    const e1 = stock.addEntry(storm, stock.locationIdOf(mainId, "Vault 3"), { quantity: 2 });
    const e2 = stock.addEntry(nothing, stock.locationIdOf(mainId, "Vault 1"));
    const id = valuation.addGroup("Set", [e1.id, e2.id]);
    renderApp(`/groups/${id}`);

    expect(await screen.findByRole("heading", { name: "Set" })).toBeInTheDocument();
    const totals = screen.getByRole("region", { name: "Group value" });
    expect(totals).toHaveTextContent("500.00");
    expect(totals).toHaveTextContent("3,750.00");
    expect(totals).toHaveTextContent("1 item without price");
    const stormRow = screen.getByText("Wings of Storm").closest("tr") as HTMLElement;
    expect(stormRow).toHaveTextContent("Vault 3");
    expect(stormRow).toHaveTextContent("500.00");

    await user.click(screen.getByRole("button", { name: "Remove Wings of Storm from group" }));
    await waitFor(() => expect(screen.queryByText("Wings of Storm")).not.toBeInTheDocument());
    expect(valuation.groupEntryIds(id)).toEqual([e2.id]);
    expect(stock.entries.some((e) => e.id === e1.id)).toBe(true);
    // Only the unpriced member is left: no value ("-"), never 0.
    const after = screen.getByRole("region", { name: "Group value" });
    expect(within(after).getByTestId("total-mc")).toHaveTextContent(/^-$/);
  });

  it("deleting a group keeps its entries and goes back to the list", async () => {
    const user = userEvent.setup();
    const e1 = stock.addEntry(
      catalog.addItem({ name: "Kris" }),
      stock.locationIdOf(mainId, "Vault 1"),
    );
    const id = valuation.addGroup("Doomed", [e1.id]);
    const { router } = renderApp(`/groups/${id}`);
    await screen.findByRole("heading", { name: "Doomed" });
    await user.click(screen.getByRole("button", { name: "Delete group" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(currentHref(router)).toBe("/groups"));
    expect(valuation.calls.groupDeletes).toEqual([id]);
    expect(stock.entries).toHaveLength(1);
  });

  it("bulk 'add to group' from the stock list selection", async () => {
    const user = userEvent.setup();
    const e1 = stock.addEntry(
      catalog.addItem({ name: "Kris" }),
      stock.locationIdOf(mainId, "Vault 1"),
    );
    stock.addEntry(catalog.addItem({ name: "Excalibur" }), stock.locationIdOf(mainId, "Vault 1"));
    const e3 = stock.addEntry(
      catalog.addItem({ name: "Thunder Blade" }),
      stock.locationIdOf(mainId, "Vault 2"),
    );
    const id = valuation.addGroup("Swords");
    renderApp("/stock");
    await screen.findByText("Kris");

    await user.click(screen.getByRole("checkbox", { name: "Select Kris" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Thunder Blade" }));
    const bar = screen.getByRole("region", { name: "Selection" });
    expect(bar).toHaveTextContent("2 selected");
    await user.selectOptions(within(bar).getByLabelText("Group"), id);
    await user.click(within(bar).getByRole("button", { name: "Add to group" }));

    await waitFor(() =>
      expect(valuation.calls.groupAdds).toEqual([{ id, stockEntryIds: [e1.id, e3.id] }]),
    );
    expect(await screen.findByText("Added 2 items to Swords.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Kris" })).not.toBeChecked();
  });
});
