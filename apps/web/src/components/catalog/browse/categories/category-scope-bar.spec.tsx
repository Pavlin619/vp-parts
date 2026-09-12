import { render, screen } from "@testing-library/react";
import { CategoryScopeBar } from "./category-scope-bar";

describe("CategoryScopeBar", () => {
  // Arriving from a homepage tile, this is the only thing on the page that says
  // the catalogue holds more than the one category on screen.
  it("goes back to the whole catalogue", () => {
    render(<CategoryScopeBar rootCount={36} />);

    expect(
      screen.getByRole("link", { name: "Всички категории" }),
    ).toHaveAttribute("href", "/catalog");
  });

  it("says how many categories that is", () => {
    render(<CategoryScopeBar rootCount={36} />);

    expect(screen.getByText("36 категории в каталога")).toBeInTheDocument();
  });

  it("declines the plural for a car with a single category", () => {
    render(<CategoryScopeBar rootCount={1} />);

    expect(screen.getByText("1 категория в каталога")).toBeInTheDocument();
  });
});
