import { StockScope, StockScopeCountsDto } from '@vp-parts-shop/shared';

/** No article counted yet — also the answer for an empty set. */
export const EMPTY_STOCK_SCOPE_COUNTS: StockScopeCountsDto = {
  all: 0,
  central: 0,
  external: 0,
};

/**
 * An article that knows which stock origins could ship it, as a ranked one does.
 *
 * Missing rather than empty when stock could not be read, and written for a
 * whole set at once — never article by article, so a set is either wholly known
 * or wholly unknown.
 */
export interface ScopedArticle {
  stockScopes?: readonly StockScope[];
}

/** A ranked set after a stock narrowing, with the breakdown it was cut from. */
export interface StockScopeSelection<T> {
  articles: T[];
  /**
   * Null when stock could not be read: the breakdown is unknown, not zero, and
   * a caller must say so rather than render an empty one.
   */
  counts: StockScopeCountsDto | null;
}

/**
 * Narrows a ranked set to one stock origin and counts what every origin holds,
 * both read off the origins the ranking already carries.
 *
 * Free by construction: the alternative — reading stock again here — measured
 * 10 ms over 100 articles and 70 ms over 1,000, two thirds of it synchronous
 * work that blocks every other request in the process. It would also answer a
 * fresher question than the order it narrows, whose positions come from the
 * snapshot these origins were taken from.
 */
export function selectStockScope<T extends ScopedArticle>(
  articles: T[],
  scope?: StockScope,
): StockScopeSelection<T> {
  if (articles.length === 0) {
    return { articles, counts: EMPTY_STOCK_SCOPE_COUNTS };
  }

  if (articles[0].stockScopes === undefined) {
    return { articles, counts: null };
  }

  return {
    articles: scope ? keepInStockScope(articles, scope) : articles,
    counts: countStockScopes(articles),
  };
}

/**
 * How many of these articles each stock origin can ship.
 *
 * Counted over the whole set it is given, which must be the *unnarrowed* one:
 * the counts are what a stock control is labelled with, so counting a set the
 * control already narrowed would make every option read as the current
 * selection.
 */
export function countStockScopes(
  articles: readonly ScopedArticle[],
): StockScopeCountsDto {
  return articles.reduce<StockScopeCountsDto>(
    (counts, article) => ({
      all: counts.all + 1,
      central: counts.central + Number(canShip(article, 'central')),
      external: counts.external + Number(canShip(article, 'external')),
    }),
    EMPTY_STOCK_SCOPE_COUNTS,
  );
}

/**
 * The articles one origin holds stock for, in the order they came in — a stock
 * narrowing removes rows from a ranking, it does not re-rank what is left.
 */
export function keepInStockScope<T extends ScopedArticle>(
  articles: T[],
  scope: StockScope,
): T[] {
  return articles.filter((article) => canShip(article, scope));
}

function canShip(article: ScopedArticle, scope: StockScope): boolean {
  return article.stockScopes?.includes(scope) ?? false;
}
