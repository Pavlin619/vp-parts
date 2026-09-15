import { queryOptions } from "@tanstack/react-query";
import {
  articleIdentityKey,
  type ArticleIdentityDto,
  type ArticlesAvailabilityDto,
} from "@vp-parts-shop/shared";
import { apiFetch } from "../index";

/**
 * Live price/availability for a batch of articles, keyed by
 * {@link articleIdentityKey}. Never cache — a cached metadata list calls this
 * per request to attach fresh delivery/stock data. Short-circuits an empty
 * request to skip the round trip.
 *
 * Both halves of the identity are sent because an article number is unique only
 * within a brand: asking by number alone would price one supplier's part from
 * another's stock.
 */
export function getArticlesAvailability(
  articles: ArticleIdentityDto[],
): Promise<ArticlesAvailabilityDto> {
  if (articles.length === 0) {
    return Promise.resolve({});
  }

  const params = new URLSearchParams({
    articles: articles
      .map((article) =>
        articleIdentityKey(article.brandId, article.articleNumber),
      )
      .join(","),
  });

  return apiFetch<ArticlesAvailabilityDto>(
    `/catalog/articles-availability?${params}`,
  );
}

/**
 * Live price/availability for one or many articles, fetched client-side. Serves
 * every surface — the buy box (a single article), search, and substitutes — so
 * identical sets share one cache entry. The key carries brand
 * and number per article and sorts them, so neither order nor a number shared by
 * two brands forks the cache. `staleTime` keeps browse data fresh enough without
 * polling; checkout is the binding re-check.
 */
export const availabilityQueryOptions = (articles: ArticleIdentityDto[]) =>
  queryOptions({
    queryKey: [
      "catalog",
      "availability",
      articles
        .map((article) =>
          articleIdentityKey(article.brandId, article.articleNumber),
        )
        .sort()
        .join(","),
    ],
    queryFn: () => getArticlesAvailability(articles),
    staleTime: 30_000,
  });
