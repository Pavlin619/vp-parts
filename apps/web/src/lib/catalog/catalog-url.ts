/**
 * The catalogue page's own URL state: which category the page is narrowed to.
 *
 * One id and no path however deep the category sits, because the page holds the
 * whole tree and `assemblyGroupNodeId` is unique across it — the root to show
 * and the levels to open through are read from the id rather than spelled out
 * here. Kept apart from `search-url.ts`: that one describes `/search`, whose
 * `cat` is the drill path that was clicked and means something else.
 */

export const CATALOG_PATH = "/catalog";

export const CATALOG_CATEGORY_PARAM = "category";

type CatalogParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

/** Where a link into the catalogue leads: the page narrowed to that category. */
export function catalogCategoryHref(categoryId: string): string {
  const params = new URLSearchParams({
    [CATALOG_CATEGORY_PARAM]: categoryId,
  });

  return `${CATALOG_PATH}?${params}`;
}

/**
 * The category the catalogue is narrowed to, or `undefined` for the whole tree.
 *
 * Whether the id is a category the car actually has is not decided here — the
 * tree it would be checked against is fetched on the client, so an id that
 * resolves to nothing is answered by the page rather than by this parser. What
 * *is* decided here is whether it could be a category at all: a TecDoc
 * `assemblyGroupNodeId` is a number, and the page offers anything it cannot
 * place as a link into the search, where a non-numeric node id is refused
 * `400`. So a hand-edited param widens the page back to the whole tree rather
 * than narrowing it to a link that fails.
 */
export function parseCatalogCategoryId(
  input: CatalogParamsInput,
): string | undefined {
  const raw =
    input instanceof URLSearchParams
      ? input.get(CATALOG_CATEGORY_PARAM)
      : input[CATALOG_CATEGORY_PARAM];

  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();

  return value && /^\d+$/.test(value) ? value : undefined;
}
