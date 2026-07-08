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
