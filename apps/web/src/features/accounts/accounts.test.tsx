import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeAuthApi } from "../../test/fake-auth-api";
import { fakeCatalogApi, type FakeCatalogApi } from "../../test/fake-catalog-api";
import { server } from "../../test/msw-server";
import { fakeStockApi, type FakeStockApi } from "../../test/fake-stock-api";
import { renderApp } from "../../test/render-app";

describe("accounts screens (task 4.10)", () => {
  let catalog: FakeCatalogApi;
  let stock: FakeStockApi;

  beforeEach(() => {
    const auth = fakeAuthApi();
    catalog = fakeCatalogApi();
    stock = fakeStockApi(catalog);
    server.use(...auth.handlers, ...catalog.handlers, ...stock.handlers);
    auth.addAccount({}, { signedIn: true });
  });

  it("lists accounts and the nav links to them", async () => {
    stock.addAccount("Main");
    stock.addAccount("Alt");
    renderApp("/");
    await userEvent.setup().click(await screen.findByRole("link", { name: "Accounts" }));
    expect(await screen.findByRole("heading", { name: "Game accounts" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alt" })).toBeInTheDocument();
  });

  it("creates an account; a duplicate name shows 'name already used'", async () => {
    const user = userEvent.setup();
    stock.addAccount("Main");
    renderApp("/accounts");
    const nameField = () => screen.getByLabelText("Account name");
    await user.type(await screen.findByLabelText("Account name"), "Alt");
    await user.click(screen.getByRole("button", { name: "Add account" }));
    expect(await screen.findByRole("link", { name: "Alt" })).toBeInTheDocument();
    await waitFor(() => expect(nameField()).toHaveValue(""));

    await user.type(nameField(), "main");
    await user.click(screen.getByRole("button", { name: "Add account" }));
    expect(await screen.findByText(/name already used/i)).toBeInTheDocument();
  });

  it("shared-schema validation: an empty name is not sent", async () => {
    const user = userEvent.setup();
    renderApp("/accounts");
    await user.click(await screen.findByRole("button", { name: "Add account" }));
    expect(await screen.findByText("Enter a name")).toBeInTheDocument();
    expect(stock.accounts).toHaveLength(0);
  });

  it("detail lists characters' inventories and vaults with entry counts", async () => {
    const user = userEvent.setup();
    const main = stock.addAccount("Main");
    const item = catalog.addItem({ name: "Wings of Storm" });
    stock.addEntry(item, stock.locationIdOf(main.id, "Vault 3"));
    stock.addEntry(item, stock.locationIdOf(main.id, "Vault 3"));
    renderApp(`/accounts/${main.id}`);
    expect(await screen.findByRole("heading", { name: "Main" })).toBeInTheDocument();

    const vault3 = await screen.findByRole("link", { name: /Vault 3/ });
    expect(vault3.closest("li")).toHaveTextContent("2 items");
    expect(screen.getAllByRole("link", { name: /^Vault \d+/ })).toHaveLength(10);

    await user.type(screen.getByLabelText("Character name"), "DarkLord");
    await user.click(screen.getByRole("button", { name: "Add character" }));
    expect(await screen.findByRole("link", { name: /Inventory – DarkLord/ })).toBeInTheDocument();
  });

  it("an over-limit vault shows the 'over limit, move items' badge", async () => {
    const main = stock.addAccount("Main");
    stock.addVault(main.id, 11);
    renderApp(`/accounts/${main.id}`);
    const vault11 = await screen.findByRole("link", { name: /Vault 11/ });
    expect(
      within(vault11.closest("li") as HTMLElement).getByText("over limit, move items"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Vault 10/ }).closest("li")).not.toHaveTextContent(
      "over limit",
    );
  });

  it("deleting an account with stock shows the 409 count message", async () => {
    const user = userEvent.setup();
    const main = stock.addAccount("Main");
    const item = catalog.addItem({ name: "Kris" });
    for (let i = 0; i < 3; i += 1) stock.addEntry(item, stock.locationIdOf(main.id, "Vault 1"));
    renderApp(`/accounts/${main.id}`);

    await user.click(await screen.findByRole("button", { name: "Delete account" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/still holds 3 items/);
    expect(stock.accounts).toHaveLength(1);
  });

  it("deleting an empty account goes back to the list", async () => {
    const user = userEvent.setup();
    const main = stock.addAccount("Main");
    const { router } = renderApp(`/accounts/${main.id}`);
    await user.click(await screen.findByRole("button", { name: "Delete account" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/accounts"));
    expect(stock.accounts).toHaveLength(0);
  });

  it("a location page lists the entries stored there", async () => {
    const main = stock.addAccount("Main");
    const vault2 = stock.locationIdOf(main.id, "Vault 2");
    stock.addEntry(catalog.addItem({ name: "Wings of Storm" }), vault2);
    stock.addEntry(catalog.addItem({ name: "Kris" }), stock.locationIdOf(main.id, "Vault 5"));
    renderApp(`/accounts/${main.id}/locations/${vault2}`);
    expect(await screen.findByRole("heading", { name: "Main · Vault 2" })).toBeInTheDocument();
    expect(await screen.findByText("Wings of Storm")).toBeInTheDocument();
    expect(screen.queryByText("Kris")).not.toBeInTheDocument();
    expect(stock.calls.stockList.at(-1)?.get("locationId")).toBe(vault2);
  });
});
