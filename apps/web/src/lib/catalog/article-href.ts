/**
 * The article detail URL. Both segments are required because a TecDoc article
 * number is unique only within a brand (`dataSupplierId`) — two suppliers can
 * file the same number, and a number-only URL resolves to whichever the
 * catalogue sorted first, which is to say the wrong part half the time.
 *
 * Every surface that links to a part goes through here so no caller can build
 * the shorter URL by hand.
 */
export function articleDetailHref(
  brandId: string,
  articleNumber: string,
): string {
  return `/catalog/articles/${encodeURIComponent(brandId)}/${encodeURIComponent(articleNumber)}`;
}
