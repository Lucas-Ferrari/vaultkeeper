import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeAuthApi } from "../../test/fake-auth-api";
import { fakeCatalogApi, type FakeCatalogApi } from "../../test/fake-catalog-api";
import { server } from "../../test/msw-server";
import { fakeStockApi, type FakeStockApi } from "../../test/fake-stock-api";
import { currentHref, renderApp } from "../../test/render-app";

describe("stock list (task 4.12, R-STK-4)", () => {
  let catalog: FakeCatalogApi;
  let stock: FakeStockApi;
  let mainId: string;

  beforeEach(() => {
    const auth = fakeAuthApi();
    catalog = fakeCatalogApi();
    stock = fakeStockApi(catalog);
    server.use(...auth.handlers, ...catalog.handlers, ...stock.handlers);
    auth.addAccount({}, { signedIn: true });
    mainId = stock.addAccount("Main").id;
  });

  const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
  const lastList = () => stock.calls.stockList.at(-1);

  it("S4: no entries shows an empty state, not an error", async () => {
    renderApp("/stock");
    expect(await screen.findByText(/No stock yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your first entry" })).toHaveAttribute(
      "href",
      "/stock/new",
    );
  });

  it("rows show placeholder image, inactive flag and '-' when unpriced", async () => {
    const storm = catalog.addItem({ name: "Wings of Storm", referencePriceMc: "100.00" });
    const rust = catalog.addItem({ name: "Wings of Rust", isActive: false });
    stock.addEntry(storm, stock.locationIdOf(mainId, "Vault 1"), { quantity: 2, level: 13 });
    stock.addEntry(rust, stock.locationIdOf(mainId, "Vault 2"));
    renderApp("/stock");

    await screen.findByText("Wings of Storm");
    const [rustRow, stormRow] = rows();
    expect(stormRow).toHaveTextContent("+13");
    expect(stormRow).toHaveTextContent("Vault 1");
    expect(stormRow).toHaveTextContent("200.00");
    expect(
      within(stormRow as HTMLElement).getByRole("img", { name: "Wings of Storm" }),
    ).toBeInTheDocument();
    expect(rustRow).toHaveTextContent("Inactive");
    expect(within(rustRow as HTMLElement).getByTestId("value")).toHaveTextContent(/^-$/);
  });

  it("validateSearch drives the query (q, accountId, category; bad values dropped)", async () => {
    const user = userEvent.setup();
    stock.addEntry(
      catalog.addItem({ name: "Wings of Storm" }),
      stock.locationIdOf(mainId, "Vault 1"),
    );
    stock.addEntry(
      catalog.addItem({ name: "Kris", categorySlug: "swords" }),
      stock.locationIdOf(mainId, "Vault 1"),
    );
    const { router } = renderApp(`/stock?accountId=${mainId}&category=swords&groupId=nope`);
    await screen.findByText("Kris");
    expect(lastList()?.get("accountId")).toBe(mainId);
    expect(lastList()?.get("category")).toBe("swords");
    expect(lastList()?.get("groupId")).toBeNull();
    expect(screen.queryByText("Wings of Storm")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Search"), "kr");
    await waitFor(() => expect(lastList()?.get("q")).toBe("kr"));
    expect(currentHref(router)).toContain("q=kr");
  });

  it("move dialog moves an entry to another location", async () => {
    const user = userEvent.setup();
    stock.addCharacter(mainId, "DarkLord");
    const entry = stock.addEntry(
      catalog.addItem({ name: "Wings of Storm" }),
      stock.locationIdOf(mainId, "Vault 3"),
    );
    renderApp("/stock");
    await screen.findByText("Wings of Storm");

    await user.click(screen.getByRole("button", { name: "Move Wings of Storm" }));
    const dialog = await screen.findByRole("dialog", { name: "Move Wings of Storm" });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("option", { name: "Main · Inventory – DarkLord" }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Move to"),
      "Main · Inventory – DarkLord",
    );
    await user.click(within(dialog).getByRole("button", { name: "Move" }));

    await waitFor(() => expect(stock.calls.moves).toHaveLength(1));
    expect(stock.calls.moves[0]).toEqual({
      id: entry.id,
      storageLocationId: stock.locationIdOf(mainId, "Inventory – DarkLord"),
    });
    await waitFor(() => expect(rows()[0]).toHaveTextContent("Inventory – DarkLord"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("delete asks for confirmation, then removes the row", async () => {
    const user = userEvent.setup();
    stock.addEntry(catalog.addItem({ name: "Kris" }), stock.locationIdOf(mainId, "Vault 1"));
    renderApp("/stock");
    await screen.findByText("Kris");
    await user.click(screen.getByRole("button", { name: "Delete Kris" }));
    expect(stock.calls.stockDeletes).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(await screen.findByText(/No stock yet/)).toBeInTheDocument();
    expect(stock.calls.stockDeletes).toHaveLength(1);
  });
});
