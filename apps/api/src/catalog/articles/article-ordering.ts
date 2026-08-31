import {
  ArticleInventoryDetailDto,
  articleIdentityKey,
  deliveryBand,
  deliveryBandRank,
} from '@vp-parts-shop/shared';
import { AvailabilityByArticle } from '../../inventory';
import { ArticleStatus } from '../../tecdoc';

/**
 * What ordering a list of articles by availability needs to know about each row,
 * beyond the live stock it looks up: the identity to look it up *by*, and the two
 * catalogue fields that settle the rows stock cannot separate.
 *
 * Deliberately structural rather than tied to one surface's row type — the
 * cross-reference list and the search results are different shapes ordered by the
 * same rule, and a second definition of that rule is a second answer to "which
 * part do we show first".
 */
export interface OrderableArticle {
  brandId: string;
  brandName: string;
  articleNumber: string;
  /** Null when TecDoc files no status, which is not the same as `Normal`. */
  articleStatusId: number | null;
}

/**
 * Live availability for the rows being ordered, keyed by
 * {@link articleIdentityKey}, or null when the stock database could not be read.
 */
export type OrderingAvailability = AvailabilityByArticle | null;

/**
 * Orders articles by what we can actually ship: in stock first, fastest delivery
 * band and then cheapest within that, and a part still in supply ahead of a
 * discontinued one among the rest.
 *
 * This is why a set is read whole rather than a page at a time — a sort on stock
 * is only meaningful if the sort sees every row. The last tiebreak is on
 * catalogue data alone so that paging is deterministic: page 2 must not reshuffle
 * against page 1 on the next request.
 *
 * `availability` is null when the stock read failed, which degrades the ordering
 * to catalogue data and leaves the list itself intact.
 */
export function orderByAvailability<T extends OrderableArticle>(
  articles: T[],
  availability: OrderingAvailability,
): T[] {
  const ranked = articles.map((article) => ({
    article,
    stock: availability?.get(identityOf(article)),
  }));

  ranked.sort((left, right) => {
    const byStock =
      stockRank(left.stock) - stockRank(right.stock) ||
      deliverySpeed(left.stock) - deliverySpeed(right.stock) ||
      price(left.stock) - price(right.stock) ||
      supplyRank(left.article) - supplyRank(right.article);

    return byStock !== 0
      ? byStock
      : catalogueOrder(left.article, right.article);
  });

  return ranked.map((entry) => entry.article);
}

function stockRank(stock: ArticleInventoryDetailDto | undefined): number {
  return stock?.available === true ? 0 : 1;
}

/**
 * The fastest delivery band any warehouse holding the part can meet.
 *
 * Ranked by band rather than by `deliveryWorkDays` because two warehouses both
 * file a nominal term of zero days: our own shelf, which ships now, and the
 * regional warehouse, which ships today only if the order beats the supplier's
 * cut-off. On days alone those tie and price decides, which lists them
 * interleaved under badges that promise different things.
 *
 * Taken as the minimum rather than the first entry so the ordering does not rest
 * on the inventory read's own warehouse order, and over stocked warehouses only,
 * so it ranks on the same row the badge is drawn from. A part nothing is known
 * about sorts last.
 */
function deliverySpeed(stock: ArticleInventoryDetailDto | undefined): number {
  const bands = (stock?.availabilityByWarehouse ?? [])
    .filter((warehouse) => warehouse.quantity > 0)
    .map((warehouse) => deliveryBandRank(deliveryBand(warehouse)));

  return bands.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...bands);
}

function price(stock: ArticleInventoryDetailDto | undefined): number {
  return stock?.bestPriceIncVat ?? Number.MAX_SAFE_INTEGER;
}

/** A part a supplier still ships, ahead of one nobody does. */
function supplyRank(article: OrderableArticle): number {
  return article.articleStatusId === ArticleStatus.Normal ? 0 : 1;
}

/**
 * Compared by code unit rather than by locale: this decides page boundaries, so
 * it has to be the same on every machine that serves a page of one list.
 */
function catalogueOrder(
  left: OrderableArticle,
  right: OrderableArticle,
): number {
  if (left.brandName !== right.brandName) {
    return left.brandName < right.brandName ? -1 : 1;
  }

  if (left.articleNumber === right.articleNumber) {
    return 0;
  }

  return left.articleNumber < right.articleNumber ? -1 : 1;
}

function identityOf(article: OrderableArticle): string {
  return articleIdentityKey(article.brandId, article.articleNumber);
}
