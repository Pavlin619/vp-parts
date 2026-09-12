import { render, screen } from "@testing-library/react";
import type { AssemblyGroupDto } from "@vp-parts-shop/shared";
import { getCatalogCategories } from "@/lib/api/catalog";
import { POPULAR_CATEGORY_IDS } from "@/lib/catalog/popular-categories";
import { PopularCategories } from "./popular-categories";

jest.mock("@/lib/api/catalog", () => ({
  getCatalogCategories: jest.fn(),
}));

const getCatalogCategoriesMock = getCatalogCategories as jest.MockedFunction<
  typeof getCatalogCategories
>;

const node = (
  id: string,
  parentId: string | null,
  name = `Категория ${id}`,
): AssemblyGroupDto => ({
  id,
  name,
  parentId,
  articleCount: 100,
  sortNo: 1,
});

const catalogueTree = (): AssemblyGroupDto[] => [
  ...POPULAR_CATEGORY_IDS.map((id) => node(id, null)),
  node("100259", "100005"),
  node("999999", null, "Каросерия"),
];

const renderSection = async () => render(await PopularCategories());

describe("PopularCategories", () => {
  beforeEach(() => {
    getCatalogCategoriesMock.mockResolvedValue(catalogueTree());
  });

  it("renders a tile for every curated category", async () => {
    await renderSection();

    expect(screen.getAllByRole("listitem")).toHaveLength(
      POPULAR_CATEGORY_IDS.length,
    );
  });

  // The homepage has no vehicle behind it, so the counts are catalogue-wide.
  it("reads the tree with no vehicle", async () => {
    await renderSection();

    expect(getCatalogCategoriesMock).toHaveBeenCalledWith();
  });

  it("offers every root the catalogue has, on a link to the catalogue", async () => {
    await renderSection();

    const link = screen.getByRole("link", {
      name: /Всички 9 категории/,
    });
    expect(link).toHaveAttribute("href", "/catalog");
  });

  it("counts the roots rather than the categories it shows", async () => {
    getCatalogCategoriesMock.mockResolvedValue([
      node("100005", null),
      node("100259", "100005"),
    ]);

    await renderSection();

    expect(
      screen.getByRole("link", { name: /Всички 1 категория/ }),
    ).toBeInTheDocument();
  });

  // An empty tree means the catalogue read failed soft or the ids drifted;
  // either way an empty grid under a heading is worse than no section.
  it("renders nothing when the tree carries none of the curated roots", async () => {
    getCatalogCategoriesMock.mockResolvedValue([node("999999", null)]);

    const { container } = await renderSection();

    expect(container).toBeEmptyDOMElement();
  });
});
