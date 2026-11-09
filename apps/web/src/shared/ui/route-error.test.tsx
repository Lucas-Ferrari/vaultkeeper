import { onlineManager } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteError } from "./route-error";

afterEach(() => {
  onlineManager.setOnline(true);
});

describe("RouteError (R-PWA-3 S1)", () => {
  it("offline: explains the page needs a connection instead of a generic crash", () => {
    onlineManager.setOnline(false);
    render(<RouteError onRetry={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "You are offline" })).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("online: shows a generic error with a working Retry", async () => {
    const onRetry = vi.fn();
    render(<RouteError onRetry={onRetry} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
