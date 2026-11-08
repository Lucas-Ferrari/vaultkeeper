import { act, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCatalogApi, type FakeCatalogApi } from "../../test/fake-catalog-api";
import { server } from "../../test/msw-server";
import { renderWithQuery } from "../../test/render-with-query";
import { ITEM_PICKER_DEBOUNCE_MS, ItemPicker } from "./containers/item-picker";

describe("item picker (task 3.19, R-SRCH-1, design 13)", () => {
  let api: FakeCatalogApi;

  beforeEach(() => {
    // Testing Library only recognises Jest fake timers: without this shim its async wrapper waits
    // on a faked setTimeout(0) forever. It calls jest.advanceTimersByTime when timers are fake.
    vi.stubGlobal("jest", { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    api = fakeCatalogApi();
    server.use(...api.handlers);
    api.addItem({ name: "Wings of Storm" });
    api.addItem({ name: "Wings of Satan" });
    api.addItem({ name: "Kris", categorySlug: "swords" });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup(onSelect = vi.fn()) {
    const user = userEvent.setup({ delay: null });
    renderWithQuery(<ItemPicker onSelect={onSelect} />);
    return { user, onSelect, input: screen.getByRole("combobox", { name: "Item" }) };
  }

  async function settle(ms = ITEM_PICKER_DEBOUNCE_MS) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("debounces: typing 'wigns' fires ONE GET /catalog/items?q=wigns after 250 ms", async () => {
    const { user, input } = setup();
    for (const char of "wigns") {
      await user.type(input, char);
      await settle(50);
    }
    expect(api.calls.userSearch).toHaveLength(0);

    await settle(ITEM_PICKER_DEBOUNCE_MS - 51);
    expect(api.calls.userSearch).toHaveLength(0);
    await settle(1);
    await vi.waitFor(() => expect(api.calls.userSearch).toHaveLength(1));
    expect(api.calls.userSearch[0]?.search.get("q")).toBe("wigns");
  });

  it("fewer than 2 characters never requests", async () => {
    const { user, input } = setup();
    await user.type(input, " w ");
    await settle(1000);
    expect(api.calls.userSearch).toHaveLength(0);
    expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument();
  });

  it("selecting a result emits the item id", async () => {
    const { user, input, onSelect } = setup();
    await user.type(input, "storm");
    await settle();
    await user.click(await screen.findByRole("option", { name: /Wings of Storm/ }));
    expect(onSelect).toHaveBeenCalledWith(api.items[0]?.id);
  });

  it("keeps the previous results visible while the next query loads", async () => {
    const { user, input } = setup();
    await user.type(input, "wings");
    await settle();
    expect(await screen.findByRole("option", { name: /Wings of Storm/ })).toBeInTheDocument();

    let release = () => {};
    api.holdUserSearch(new Promise<void>((resolve) => (release = resolve)));
    await user.type(input, " of sa");
    await settle();
    await vi.waitFor(() => expect(api.calls.userSearch).toHaveLength(2));
    expect(screen.getByRole("option", { name: /Wings of Storm/ })).toBeInTheDocument();
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-busy", "true");

    await act(async () => release());
    await vi.waitFor(() =>
      expect(screen.queryByRole("option", { name: /Wings of Storm/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("option", { name: /Wings of Satan/ })).toBeInTheDocument();
  });

  it("never shows inactive items, even if a response contained one", async () => {
    api.addItem({ name: "Wings of Ghost", isActive: false });
    const { user, input } = setup();
    await user.type(input, "wings");
    await settle();
    await screen.findByRole("option", { name: /Wings of Storm/ });
    expect(screen.queryByRole("option", { name: /Ghost/ })).not.toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    const { user, input } = setup();
    await user.type(input, "zzzz");
    await settle();
    expect(await screen.findByText(/no items match/i)).toBeInTheDocument();
  });
});
