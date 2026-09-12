/**
 * The catalogue page's own URL state: which root category the page is narrowed
 * to.
 *
 * One root id and no path, because the panel walks every level below the root
 * as local state — the URL only has to say which card the page opened on. Kept
 * apart from `search-url.ts`: that one describes `/search`, whose `cat` is a
 * full drill path and means something else.
 */

export const CATALOG_PATH = "/catalog";

export const CATALOG_CATEGORY_PARAM = "category";

type CatalogParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

/** Where a category tile leads: the catalogue, narrowed to that root. */
export function catalogCategoryHref(categoryId: string): string {
  const params = new URLSearchParams({
    [CATALOG_CATEGORY_PARAM]: categoryId,
  });

  return `${CATALOG_PATH}?${params}`;
}

/**
 * The root the catalogue is narrowed to, or `undefined` for the whole tree.
 *
 * Whether the id is a category the car actually has is not decided here — the
 * tree it would be checked against is fetched on the client, so an id that
 * resolves to nothing is answered by the page rather than by this parser.
 */
export function parseCatalogCategoryId(
  input: CatalogParamsInput,
): string | undefined {
  const raw =
    input instanceof URLSearchParams
      ? input.get(CATALOG_CATEGORY_PARAM)
      : input[CATALOG_CATEGORY_PARAM];

  const value = Array.isArray(raw) ? raw[0] : raw;

  return value?.trim() || undefined;
}
