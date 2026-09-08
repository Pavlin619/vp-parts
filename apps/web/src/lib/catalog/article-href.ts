/**
 * The article detail URL. Both segments are required because a TecDoc article
 * number is unique only within a brand (`dataSupplierId`) — two suppliers can
 * file the same number, and a number-only URL resolves to whichever the
 * catalogue sorted first, which is to say the wrong part half the time.
 *
 * Every surface that links to a part goes through here so no caller can build
 * the shorter URL by hand.
 *
 * `categoryNodeId` is the category the visitor was standing in, and it is the
 * page's breadcrumb that reads it: TecDoc files one part under several trails
 * at once, so without it the page has to guess which one the visitor walked.
 * A surface with no category of its own — an autocomplete row, a substitute of
 * another part — leaves it off and the page falls back to its own rule.
 */
export function articleDetailHref(
  brandId: string,
  articleNumber: string,
  categoryNodeId?: string,
): string {
  const path = `/catalog/articles/${encodeURIComponent(brandId)}/${encodeURIComponent(articleNumber)}`;

  return categoryNodeId
    ? `${path}?categoryId=${encodeURIComponent(categoryNodeId)}`
    : path;
}
