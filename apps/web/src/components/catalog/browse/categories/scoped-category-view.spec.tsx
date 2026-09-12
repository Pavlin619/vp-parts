import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CategoryTreeNode } from "@/lib/catalog/category-tree";
import { ScopedCategoryView } from "./scoped-category-view";

function node(
  id: string,
  name: string,
  children: CategoryTreeNode[] = [],
): CategoryTreeNode {
  return {
    category: { id, name, parentId: null, articleCount: 747, sortNo: 1 },
    children,
  };
}

const BRAKES = node("100006", "спирачна уредба", [
  node("100269", "дискови спирачки", [node("100270", "накладки")]),
  node("100271", "барабанни спирачки"),
]);

const renderScoped = (root: CategoryTreeNode) =>
  render(
    <ScopedCategoryView root={root} vehicleId="13074" vehicleName="AUDI A3" />,
  );

describe("ScopedCategoryView", () => {
  it("shows the card for the category it is narrowed to", () => {
    renderScoped(BRAKES);

    expect(
      screen.getByRole("button", { name: /спирачна уредба/ }),
    ).toBeInTheDocument();
  });

  // Arriving here is already the decision to open this category, so the level
  // below it is what the page should be showing.
  it("opens the drill panel without being asked", () => {
    renderScoped(BRAKES);

    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "спирачна уредба",
    );
    expect(screen.getByText("дискови спирачки")).toBeInTheDocument();
    expect(screen.getByText("барабанни спирачки")).toBeInTheDocument();
  });

  it("collapses to the card alone and back", async () => {
    renderScoped(BRAKES);

    const card = screen.getByRole("button", { name: /спирачна уредба/ });
    await userEvent.click(card);

    expect(card).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("дискови спирачки")).not.toBeInTheDocument();

    await userEvent.click(card);
    expect(screen.getByText("дискови спирачки")).toBeInTheDocument();
  });

  it("closes from the panel too", async () => {
    renderScoped(BRAKES);

    await userEvent.click(screen.getByRole("button", { name: "Затвори" }));

    expect(screen.queryByText("дискови спирачки")).not.toBeInTheDocument();
  });

  /**
   * `почистване на фаровете` is a root with nothing under it. There is no level
   * to open, so the card is a link straight into the listing and no panel is
   * rendered at all.
   */
  it("leaves a childless root as a link with no panel", () => {
    renderScoped(node("100342", "почистване на фаровете"));

    expect(screen.getByRole("link")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });
});
