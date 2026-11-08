import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "./footer";

describe("Footer", () => {
  it("shows the non-affiliation disclaimer (R-DOC-2)", () => {
    render(<Footer />);

    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "Not affiliated with Webzen or MEGADEV",
    );
  });
});
