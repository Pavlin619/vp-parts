import { categoryDrillOf } from "./category-trail";
import type { CategoryTreeNode } from "./category-tree";

function node(
  id: string,
  name: string,
  children: CategoryTreeNode[] = [],
): CategoryTreeNode {
  return {
    category: { id, name, parentId: null, articleCount: 100, sortNo: 1 },
    children,
  };
}

const HEAD_GASKET = node("100320", "гарнитура цилиндрова глава");
const CYLINDER_HEAD = node("100249", "цилиндрова глава/монтажни части", [
  HEAD_GASKET,
  node("100321", "болтове"),
]);
const ENGINE = node("100002", "двигател", [CYLINDER_HEAD]);
const HEADLAMP_CLEANING = node("100342", "почистване на фаровете");

const ROOTS = [ENGINE, HEADLAMP_CLEANING];

describe("categoryDrillOf", () => {
  it("opens the whole grid when the URL names no category", () => {
    expect(categoryDrillOf(ROOTS, undefined)).toEqual({
      root: null,
      path: [],
    });
  });

  it("opens a root on its own level", () => {
    expect(categoryDrillOf(ROOTS, "100002")).toEqual({
      root: ENGINE,
      path: [],
    });
  });

  // The whole point of the deep link: the card is the root's, and the panel is
  // already inside the category that was asked for.
  it("opens a subcategory through its root", () => {
    expect(categoryDrillOf(ROOTS, "100249")).toEqual({
      root: ENGINE,
      path: [CYLINDER_HEAD],
    });
  });

  /**
   * A category with nothing under it has no level of its own to open, so the
   * panel stops on its parent and marks the row instead — the alternative is a
   * panel reporting no groups at all.
   */
  it("stops on the parent of a category with nothing under it", () => {
    expect(categoryDrillOf(ROOTS, "100320")).toEqual({
      root: ENGINE,
      path: [CYLINDER_HEAD],
      markedCategoryId: "100320",
    });
  });

  // `почистване на фаровете` is a root with no children. Its card is a link
  // into the listing and there is no panel to mark anything in.
  it("marks nothing when a childless category is itself the root", () => {
    expect(categoryDrillOf(ROOTS, "100342")).toEqual({
      root: HEADLAMP_CLEANING,
      path: [],
    });
  });

  // A stale link, or — under a car — a category this model takes no parts from.
  // The page answers that, so the drill only has to say the tree has no place
  // for it.
  it("finds no root for a category the tree does not hold", () => {
    expect(categoryDrillOf(ROOTS, "999999")).toEqual({
      root: null,
      path: [],
    });
  });

  it("finds nothing in an empty tree", () => {
    expect(categoryDrillOf([], "100002")).toEqual({ root: null, path: [] });
  });
});
