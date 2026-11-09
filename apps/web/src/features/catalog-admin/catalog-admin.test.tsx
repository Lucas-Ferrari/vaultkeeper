import { ROLE } from "@vaultkeeper/shared/constants";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAuthApi, type FakeAuthApi } from "../../test/fake-auth-api";
import { fakeCatalogApi, type FakeCatalogApi } from "../../test/fake-catalog-api";
import { server } from "../../test/msw-server";
import { currentHref, renderApp } from "../../test/render-app";

describe("admin catalog list + edit (task 3.20, R-CAT-2, R-CAT-3)", () => {
  let auth: FakeAuthApi;
  let catalog: FakeCatalogApi;

  beforeEach(() => {
    auth = fakeAuthApi();
    catalog = fakeCatalogApi();
    server.use(...auth.handlers, ...catalog.handlers);
    auth.addAccount({ role: ROLE.ADMIN }, { signedIn: true });
    catalog.addItem({ name: "Wings of Storm", referencePriceMc: "1500.00" });
    catalog.addItem({ name: "Wings of Rust", isActive: false });
    catalog.addItem({ name: "Kris", categorySlug: "swords" });
  });

  const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
  const lastAdminList = () => catalog.calls.adminList.at(-1)?.search;

  it("lists active AND inactive items by default (sends includeInactive=true)", async () => {
    renderApp("/catalog");
    expect(await screen.findByRole("heading", { name: "Catalog" })).toBeInTheDocument();
    await screen.findByRole("link", { name: "Wings of Rust" });
    expect(rows()).toHaveLength(3);
    expect(lastAdminList()?.get("includeInactive")).toBe("true");
    const rust = screen.getByRole("link", { name: "Wings of Rust" }).closest("tr");
    expect(rust).toHaveTextContent("Inactive");
  });

  it("filters by q, category and status=inactive (active=false), kept in the URL", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/catalog");
    await screen.findByRole("link", { name: "Kris" });

    await user.selectOptions(screen.getByLabelText("Status"), "inactive");
    await waitFor(() => expect(lastAdminList()?.get("active")).toBe("false"));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByRole("link", { name: "Wings of Rust" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status"), "all");
    await user.selectOptions(screen.getByLabelText("Category"), "swords");
    await waitFor(() => expect(lastAdminList()?.get("category")).toBe("swords"));
    await waitFor(() => expect(rows()).toHaveLength(1));

    await user.selectOptions(screen.getByLabelText("Category"), "");
    await user.type(screen.getByLabelText("Search"), "storm");
    await waitFor(() => expect(lastAdminList()?.get("q")).toBe("storm"));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(currentHref(router)).toContain("q=storm");
  });

  it("the admin nav links to the catalog; plain users do not see it", async () => {
    renderApp("/");
    expect(await screen.findByRole("link", { name: "Catalog" })).toHaveAttribute(
      "href",
      "/catalog",
    );
  });

  it("edit form shows shared-schema errors (negative price) and does not save", async () => {
    const user = userEvent.setup();
    const item = catalog.items[0];
    renderApp(`/catalog/${item?.id}`);
    const price = await screen.findByLabelText("Reference price (MC)");
    expect(price).toHaveValue("1500.00");

    await user.clear(price);
    await user.type(price, "-5");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/non-negative amount/)).toBeInTheDocument();
    expect(price).toHaveAttribute("aria-invalid", "true");
    expect(catalog.calls.patches).toHaveLength(0);
  });

  it("saves edits (empty price = unpriced) and invalidates catalog + valuation queries", async () => {
    const user = userEvent.setup();
    const item = catalog.items[0];
    const { queryClient } = renderApp(`/catalog/${item?.id}`);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const name = await screen.findByLabelText("Name");

    await user.clear(name);
    await user.type(name, "Wings of Tempest");
    await user.clear(screen.getByLabelText("Reference price (MC)"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(catalog.calls.patches).toHaveLength(1));
    expect(catalog.calls.patches[0]?.body).toEqual({
      name: "Wings of Tempest",
      categorySlug: "wings",
      referencePriceMc: null,
    });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["catalog"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["valuation"] });
  });

  it("deactivate / reactivate toggle", async () => {
    const user = userEvent.setup();
    const item = catalog.items[0];
    renderApp(`/catalog/${item?.id}`);

    await user.click(await screen.findByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(catalog.calls.patches.at(-1)?.body).toEqual({ isActive: false }));
    expect(await screen.findByRole("button", { name: "Reactivate" })).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reactivate" }));
    await waitFor(() => expect(catalog.calls.patches.at(-1)?.body).toEqual({ isActive: true }));
  });

  it("delete of an item in use (409 REFERENCED) says to deactivate instead", async () => {
    const user = userEvent.setup();
    const item = catalog.items[0];
    catalog.referenced.add(item?.id ?? "");
    renderApp(`/catalog/${item?.id}`);

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/in use.*deactivate it instead/i);
    expect(catalog.items).toContain(item);
  });

  it("delete of an unused item returns to the list", async () => {
    const user = userEvent.setup();
    const item = catalog.items[2];
    const { router } = renderApp(`/catalog/${item?.id}`);

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/catalog"));
    expect(catalog.calls.deletes).toEqual([item?.id]);
  });

  it("a plain user visiting /catalog is redirected to /", async () => {
    auth.addAccount({ role: ROLE.USER }, { signedIn: true });
    const { router } = renderApp("/catalog");
    await screen.findByRole("heading", { name: "Dashboard" });
    expect(currentHref(router)).toBe("/");
    expect(screen.queryByRole("link", { name: "Catalog" })).not.toBeInTheDocument();
  });
});
