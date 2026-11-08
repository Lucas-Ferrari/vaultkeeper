import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateToast } from "./update-toast";

const pwa = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(async () => {}),
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [pwa.needRefresh, pwa.setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: pwa.updateServiceWorker,
  }),
}));

describe("UpdateToast (R-PWA-4 S1)", () => {
  beforeEach(() => {
    pwa.needRefresh = false;
    pwa.setNeedRefresh.mockClear();
    pwa.updateServiceWorker.mockClear();
  });

  it("renders nothing while the running version is current", () => {
    render(<UpdateToast />);

    expect(screen.queryByText("New version available")).not.toBeInTheDocument();
  });

  it("offers a reload when a new version is waiting and activates it on Reload", async () => {
    pwa.needRefresh = true;
    render(<UpdateToast />);

    expect(screen.getByRole("status")).toHaveTextContent("New version available");
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("can be dismissed until the next launch", async () => {
    pwa.needRefresh = true;
    render(<UpdateToast />);

    await userEvent.click(screen.getByRole("button", { name: "Later" }));

    expect(pwa.setNeedRefresh).toHaveBeenCalledWith(false);
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled();
  });
});
