import type { AssemblyGroupDto } from "@vp-parts-shop/shared";
import {
  POPULAR_CATEGORY_IDS,
  countCategoryRoots,
  selectPopularCategories,
} from "./popular-categories";

const node = (
  id: string,
  parentId: string | null,
  articleCount = 100,
): AssemblyGroupDto => ({
  id,
  name: `Категория ${id}`,
  parentId,
  articleCount,
  sortNo: 1,
});

const roots = (): AssemblyGroupDto[] =>
  POPULAR_CATEGORY_IDS.map((id) => node(id, null));

describe("selectPopularCategories", () => {
  it("keeps the curated order, whatever order the tree arrives in", () => {
    const tree = [...roots()].reverse();

    expect(selectPopularCategories(tree).map((entry) => entry.id)).toEqual([
      ...POPULAR_CATEGORY_IDS,
    ]);
  });

  it("counts a root's direct children as its groups", () => {
    const tree = [
      node("100005", null, 39592),
      node("100259", "100005"),
      node("100261", "100005"),
      // A grandchild belongs to its own parent, not to the root.
      node("100999", "100259"),
    ];

    expect(selectPopularCategories(tree)).toEqual([
      {
        id: "100005",
        name: "Категория 100005",
        articleCount: 39592,
        groupCount: 2,
      },
    ]);
  });

  it("reports no groups for a root the catalogue files no children under", () => {
    expect(selectPopularCategories([node("100005", null)])[0].groupCount).toBe(
      0,
    );
  });

  // The facet only returns categories that hold parts, so a curated id the
  // tree does not carry is a category with nothing to sell.
  it("skips a curated root the tree does not carry", () => {
    const tree = [node("100005", null), node("100002", null)];

    expect(selectPopularCategories(tree).map((entry) => entry.id)).toEqual([
      "100005",
      "100002",
    ]);
  });

  it("selects nothing from an empty tree", () => {
    expect(selectPopularCategories([])).toEqual([]);
  });

  it("carries a name TecDoc's own casing has already been fixed on", () => {
    const tree = [{ ...node("100005", null), name: "Филтър" }];

    expect(selectPopularCategories(tree)[0].name).toBe("Филтър");
  });
});

describe("countCategoryRoots", () => {
  it("counts only the nodes with no parent", () => {
    const tree = [
      node("100005", null),
      node("100259", "100005"),
      node("100002", null),
      node("100999", "100259"),
    ];

    expect(countCategoryRoots(tree)).toBe(2);
  });

  it("counts nothing in an empty tree", () => {
    expect(countCategoryRoots([])).toBe(0);
  });
});
