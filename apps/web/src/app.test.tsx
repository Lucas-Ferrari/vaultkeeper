import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeAuthApi } from "./test/fake-auth-api";
import { server } from "./test/msw-server";
import { renderApp } from "./test/render-app";

describe("app shell", () => {
  beforeEach(() => {
    server.use(...fakeAuthApi().handlers);
  });

  it("renders pages inside the shell with the disclaimer footer, signed out too (R-DOC-2 S1)", async () => {
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "Not affiliated with Webzen or MEGADEV",
    );
  });
});
