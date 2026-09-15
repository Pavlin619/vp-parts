import { render, screen } from "@testing-library/react";
import type { PopularCategory } from "@/lib/catalog/categories/popular-categories";
import { PopularCategoryCard } from "./popular-category-card";

const category = (overrides: Partial<PopularCategory> = {}): PopularCategory => ({
  id: "100005",
  name: "Филтър",
  articleCount: 39592,
  groupCount: 6,
  ...overrides,
});

const renderCard = (entry: PopularCategory) =>
  render(
    <ul>
      <PopularCategoryCard category={entry} />
    </ul>,
  );

describe("PopularCategoryCard", () => {
  it("names the category", () => {
    renderCard(category());

    expect(screen.getByText("Филтър")).toBeInTheDocument();
  });

  it("summarises the groups inside it and the parts it holds", () => {
    renderCard(category());

    expect(screen.getByText("6 групи · 39 592 артикула")).toBeInTheDocument();
  });

  // `почистване на фаровете` is a root with no children at all, so there is no
  // depth to state — only what opening it would show.
  it("states only the count for a root with no groups", () => {
    renderCard(category({ groupCount: 0, articleCount: 106 }));

    expect(screen.getByText("106 артикула")).toBeInTheDocument();
  });

  it("declines the plural for a single group and a single part", () => {
    renderCard(category({ groupCount: 1, articleCount: 1 }));

    expect(screen.getByText("1 група · 1 артикул")).toBeInTheDocument();
  });

  it("renders the category's illustration", () => {
    renderCard(category());

    expect(screen.getByRole("presentation", { hidden: true })).toHaveAttribute(
      "src",
      expect.stringContaining("filters.webp"),
    );
  });

  // The whole tile is the target, not the name inside it.
  it("opens the catalogue narrowed to the category", () => {
    renderCard(category());

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/catalog?category=100005",
    );
  });
});
