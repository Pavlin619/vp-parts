import {
  CATALOG_PATH,
  catalogCategoryHref,
  parseCatalogCategoryId,
} from "./catalog-url";

describe("catalogCategoryHref", () => {
  it("points at the catalogue narrowed to the category", () => {
    expect(catalogCategoryHref("100006")).toBe("/catalog?category=100006");
  });

  // A subcategory links the same way a root does: the page resolves the root to
  // show and the levels to open from the id alone.
  it("says nothing about how deep the category sits", () => {
    expect(catalogCategoryHref("100249")).toBe("/catalog?category=100249");
  });

  it("encodes an id that would otherwise break the query string", () => {
    expect(catalogCategoryHref("100 006&x")).toBe(
      `${CATALOG_PATH}?category=100+006%26x`,
    );
  });
});

describe("parseCatalogCategoryId", () => {
  it("reads the id the tile linked with", () => {
    expect(parseCatalogCategoryId({ category: "100006" })).toBe("100006");
  });

  it("reads it out of URLSearchParams just as well", () => {
    expect(
      parseCatalogCategoryId(new URLSearchParams("category=100006")),
    ).toBe("100006");
  });

  it("means the whole tree when the param is absent", () => {
    expect(parseCatalogCategoryId({})).toBeUndefined();
    expect(parseCatalogCategoryId(new URLSearchParams())).toBeUndefined();
  });

  // A hand-edited URL can repeat or empty the param; neither is a narrowing.
  it("takes the first of a repeated param", () => {
    expect(parseCatalogCategoryId({ category: ["100006", "100005"] })).toBe(
      "100006",
    );
  });

  it("treats a blank value as no narrowing", () => {
    expect(parseCatalogCategoryId({ category: "   " })).toBeUndefined();
  });

  // A node id is a number. The page offers a category it cannot place as a link
  // into the search, where anything else is refused `400` — so a value that
  // could not be an id widens the page back to the whole tree instead.
  it("refuses a value that could not be a node id", () => {
    expect(parseCatalogCategoryId({ category: "100 006&x" })).toBeUndefined();
    expect(parseCatalogCategoryId({ category: "накладки" })).toBeUndefined();
    expect(parseCatalogCategoryId({ category: "100006;" })).toBeUndefined();
  });

  it("keeps the surrounding whitespace of a real id out of the way", () => {
    expect(parseCatalogCategoryId({ category: " 100006 " })).toBe("100006");
  });
});
