import {
  CATALOG_PATH,
  catalogCategoryHref,
  parseCatalogCategoryId,
} from "./catalog-url";

describe("catalogCategoryHref", () => {
  it("points at the catalogue narrowed to the root", () => {
    expect(catalogCategoryHref("100006")).toBe("/catalog?category=100006");
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
});
