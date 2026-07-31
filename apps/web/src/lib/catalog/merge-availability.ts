import type {
  ArticleInventoryDetailDto,
  ArticlesAvailabilityDto,
} from "@vp-parts-shop/shared";

/** Neutral detail for a requested article the availability read had no row for. */
export const UNAVAILABLE_DETAIL: ArticleInventoryDetailDto = {
  available: false,
  bestPriceExVat: null,
  bestPriceIncVat: null,
  availabilityByWarehouse: [],
  computedAt: null,
};

/**
 * Joins cached catalog metadata rows with a live availability map (keyed by
 * article number) into a single enriched row shape. Works for any metadata that
 * carries an `articleNumber` — the listing grid and substitutes (catalog list
 * items), search hits, etc. A row the availability read had no entry for
 * degrades to the neutral unavailable state rather than dropping out, so the
 * metadata order is always preserved.
 */
export function mergeArticleAvailability<T extends { articleNumber: string }>(
  items: T[],
  availability: ArticlesAvailabilityDto,
): (T & ArticleInventoryDetailDto)[] {
  return items.map((item) => ({
    ...item,
    ...(availability[item.articleNumber] ?? UNAVAILABLE_DETAIL),
  }));
}

/**
 * Live inventory for one row of a catalog surface, as the three states a
 * separately-fetched availability read can be in:
 *  - `undefined` — still in flight, the row shows skeletons;
 *  - `null` — the read failed, the row shows a neutral "unknown" state;
 *  - the detail — resolved.
 *
 * Modelling the states in the value (rather than as extra boolean props) keeps
 * every row surface honest: a failed read can never be mistaken for "this part
 * is out of stock".
 */
export type RowAvailability = ArticleInventoryDetailDto | null | undefined;

/**
 * Picks one article's live inventory out of a batch availability read, carrying
 * the pending/failed state through untouched. A number the read had no row for
 * degrades to {@link UNAVAILABLE_DETAIL}, matching
 * {@link mergeArticleAvailability}.
 */
export function selectArticleAvailability(
  availability: ArticlesAvailabilityDto | null | undefined,
  articleNumber: string,
): RowAvailability {
  if (!availability) {
    return availability;
  }

  return availability[articleNumber] ?? UNAVAILABLE_DETAIL;
}
