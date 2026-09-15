import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CategoryTreeNode } from "@/lib/catalog/categories/category-tree";
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
    <ScopedCategoryView
      root={root}
      scope={{ vehicleId: "13074", vehicleName: "AUDI A3" }}
    />,
  );

/**
 * A row on the level the panel is showing. Queried inside the panel because the
 * card above it previews its children by name, so a bare role query for a row
 * matches the card too.
 */
const panelRow = (name: RegExp) =>
  within(screen.getByRole("region", { name: /^Групи в/ })).getByRole("button", {
    name,
  });

const replaceState = jest.spyOn(window.history, "replaceState");

/** The URL the last shallow history write named. */
const recordedUrl = () => replaceState.mock.calls.at(-1)?.[2];

beforeEach(() => {
  replaceState.mockClear();
});

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

    const card = screen.getByRole("button", {
      name: /спирачна уредба/,
      expanded: true,
    });
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

  // The card stays the root's — that is the illustrated level — while the panel
  // beside it opens where the link pointed.
  it("opens the panel on the level a deep link named", () => {
    render(
      <ScopedCategoryView
        root={BRAKES}
        initialPath={[BRAKES.children[0]]}
        markedCategoryId="100270"
        scope={{ vehicleId: "13074", vehicleName: "AUDI A3" }}
      />,
    );

    // The path bar names the root too, so the card is the one that expands.
    expect(
      screen.getByRole("button", { name: /спирачна уредба/, expanded: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "дискови спирачки",
    );
    expect(screen.getByRole("link", { name: /накладки/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});

/**
 * The URL names the category on screen, so a reload or a shared link lands
 * where the visitor is standing. Shallow writes, because the tree is already in
 * the client and a navigation would remount the panel being recorded.
 */
describe("ScopedCategoryView — recording the level in the URL", () => {
  it("names the level a drill opened", async () => {
    renderScoped(BRAKES);

    await userEvent.click(panelRow(/дискови спирачки/));

    expect(recordedUrl()).toBe("/catalog?category=100269");
  });

  it("names the level stepped back to", async () => {
    renderScoped(BRAKES);

    await userEvent.click(panelRow(/дискови спирачки/));
    await userEvent.click(screen.getByRole("button", { name: "Назад" }));

    expect(recordedUrl()).toBe("/catalog?category=100006");
  });

  it("records nothing until the visitor moves", () => {
    renderScoped(BRAKES);

    expect(replaceState).not.toHaveBeenCalled();
  });

  // Closing leaves the root card alone on screen, so that is what the URL says
  // — and reopening then starts there rather than back where the link pointed.
  it("falls back to the root when the panel is closed, and reopens there", async () => {
    render(
      <ScopedCategoryView
        root={BRAKES}
        initialPath={[BRAKES.children[0]]}
        scope={null}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Затвори" }));
    expect(recordedUrl()).toBe("/catalog?category=100006");

    await userEvent.click(
      screen.getByRole("button", { name: /спирачна уредба/ }),
    );
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "спирачна уредба",
    );
  });
});
