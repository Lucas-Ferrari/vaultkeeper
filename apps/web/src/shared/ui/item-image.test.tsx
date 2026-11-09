import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";
import { ItemImage } from "./item-image";

const KEY = `catalog/${"a".repeat(64)}.png`;
const OTHER_KEY = `catalog/${"b".repeat(64)}.webp`;

describe("ItemImage (task 3.18, R-CAT-6 S3)", () => {
  it("renders the stored image from /media/<key>", () => {
    render(<ItemImage imageKey={KEY} name="Wings of Storm" categoryIcon="wings" />);
    expect(screen.getByRole("img", { name: "Wings of Storm" })).toHaveAttribute(
      "src",
      `/media/${KEY}`,
    );
  });

  it("no image -> the category placeholder icon", () => {
    render(<ItemImage imageKey={null} name="Kris" categoryIcon="sword" />);
    const placeholder = screen.getByRole("img", { name: "Kris" });
    expect(placeholder.tagName).not.toBe("IMG");
    expect(placeholder).toHaveAttribute("data-icon", "sword");
  });

  it("a broken image falls back to the placeholder; a new key tries again", () => {
    const { rerender } = render(<ItemImage imageKey={KEY} name="Kris" categoryIcon="sword" />);
    fireEvent.error(screen.getByRole("img", { name: "Kris" }));
    expect(screen.getByRole("img", { name: "Kris" })).toHaveAttribute("data-icon", "sword");

    rerender(<ItemImage imageKey={OTHER_KEY} name="Kris" categoryIcon="sword" />);
    expect(screen.getByRole("img", { name: "Kris" })).toHaveAttribute("src", `/media/${OTHER_KEY}`);
  });

  it("unknown icon keys still get a generic placeholder", () => {
    render(<ItemImage imageKey={null} name="Odd" categoryIcon="nope" />);
    expect(screen.getByRole("img", { name: "Odd" })).toHaveAttribute("data-icon", "nope");
  });
});

describe("Badge", () => {
  it("renders its label", () => {
    render(<Badge tone="muted">Inactive</Badge>);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });
});
