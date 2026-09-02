import {
  ArticleInventoryDetailDto,
  SearchSort,
  articleIdentityKey,
  deliveryBand,
  deliveryBandRank,
} from '@vp-parts-shop/shared';
import { AvailabilityByArticle } from '../../../inventory';
import { ArticleStatus } from '../../../tecdoc';

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

/** One row paired with the live stock the ordering reads it by. */
interface RankedArticle<T> {
  article: T;
  stock: ArticleInventoryDetailDto | undefined;
}

type Ranking<T> = (left: RankedArticle<T>, right: RankedArticle<T>) => number;

/**
 * Orders a whole set of articles the way a visitor asked for — the one place a
 * {@link SearchSort} becomes a comparator, so every paged surface answers a
 * given sort identically.
 *
 * `availability` is null when the stock read failed, which degrades the two
 * orders that depend on it to catalogue data and leaves the list itself intact.
 * The catalogue axes never consult it at all.
 */
export function orderArticles<T extends OrderableArticle>(
  articles: T[],
  availability: OrderingAvailability,
  sort: SearchSort,
): T[] {
  if (sort === SearchSort.Catalogue) {
    return [...articles];
  }

  const ranked = articles.map((article) => ({
    article,
    stock: availability?.get(identityOf(article)),
  }));

  ranked.sort(rankingFor<T>(sort));

  return ranked.map((entry) => entry.article);
}

function rankingFor<T extends OrderableArticle>(sort: SearchSort): Ranking<T> {
  switch (sort) {
    case SearchSort.PriceAscending:
      return byPrice('asc');
    case SearchSort.PriceDescending:
      return byPrice('desc');
    case SearchSort.Brand:
      return (left, right) => catalogueOrder(left.article, right.article);
    case SearchSort.ArticleNumber:
      return (left, right) => numberOrder(left.article, right.article);
    default:
      return byAvailability;
  }
}

/**
 * What we can actually ship: in stock first, fastest delivery band and then
 * cheapest within that, and a part still in supply ahead of a discontinued one
 * among the rest.
 *
 * This is why a set is read whole rather than a page at a time — a sort on stock
 * is only meaningful if the sort sees every row. The last tiebreak is on
 * catalogue data alone so that paging is deterministic: page 2 must not reshuffle
 * against page 1 on the next request.
 */
function byAvailability<T extends OrderableArticle>(
  left: RankedArticle<T>,
  right: RankedArticle<T>,
): number {
  const byStock =
    stockRank(left.stock) - stockRank(right.stock) ||
    deliverySpeed(left.stock) - deliverySpeed(right.stock) ||
    comparePrice(left.stock, right.stock, 'asc') ||
    supplyRank(left.article) - supplyRank(right.article);

  return byStock !== 0 ? byStock : catalogueOrder(left.article, right.article);
}

/**
 * Cheapest or dearest first — but still what we can ship first, because a part
 * nobody can send has no price to be cheapest at, and putting it above a stocked
 * one sorts the list by a price nobody can pay.
 */
function byPrice<T extends OrderableArticle>(
  direction: 'asc' | 'desc',
): Ranking<T> {
  return (left, right) => {
    const byStock =
      stockRank(left.stock) - stockRank(right.stock) ||
      comparePrice(left.stock, right.stock, direction) ||
      deliverySpeed(left.stock) - deliverySpeed(right.stock) ||
      supplyRank(left.article) - supplyRank(right.article);

    return byStock !== 0
      ? byStock
      : catalogueOrder(left.article, right.article);
  };
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

/**
 * Unpriced rows sort last whichever way the list runs, which is why this is not
 * a subtraction against a sentinel: treating a missing price as infinity puts it
 * last ascending and *first* descending, heading "dearest first" with the rows
 * carrying no price at all.
 */
function comparePrice(
  left: ArticleInventoryDetailDto | undefined,
  right: ArticleInventoryDetailDto | undefined,
  direction: 'asc' | 'desc',
): number {
  const leftPrice = left?.bestPriceIncVat ?? null;
  const rightPrice = right?.bestPriceIncVat ?? null;

  if (leftPrice === null || rightPrice === null) {
    return (leftPrice === null ? 1 : 0) - (rightPrice === null ? 1 : 0);
  }

  return direction === 'asc' ? leftPrice - rightPrice : rightPrice - leftPrice;
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

/** The same two axes as {@link catalogueOrder}, with the number leading. */
function numberOrder(left: OrderableArticle, right: OrderableArticle): number {
  if (left.articleNumber !== right.articleNumber) {
    return left.articleNumber < right.articleNumber ? -1 : 1;
  }

  if (left.brandName === right.brandName) {
    return 0;
  }

  return left.brandName < right.brandName ? -1 : 1;
}

function identityOf(article: OrderableArticle): string {
  return articleIdentityKey(article.brandId, article.articleNumber);
}
