import { Injectable } from '@nestjs/common';
import { ArticleSummaryDto } from '@vp-parts-shop/shared';
import { RedisCache } from '../../../redis';
import { ArticleRowsTecDoc } from './article-rows.tecdoc';

/** A hydrated row is TecDoc catalog data, so it ages like the rest of it. */
const ARTICLE_ROW_TTL = 24 * 60 * 60;

/**
 * The whole of what turning an article into a rendered row needs: which part it
 * is, and the id TecDoc will answer for it. An `ArticleCandidate` satisfies it,
 * and so does an ordered list stored with nothing else in it — which is the
 * point of asking for this rather than for a candidate.
 */
export interface HydratableArticle {
  brandId: string;
  articleNumber: string;
  legacyArticleIds: number[];
}

/**
 * The rendered rows for one page of any article list, cached per row.
 *
 * Cached per row rather than per page, because a list's ordering is live: a
 * page-number key would serve yesterday's ordering, and an id-set key would miss
 * whenever stock moved a row across a page boundary. Per-row entries also mean a
 * part surfaced by two different lists is fetched once — which is the point of
 * this being shared rather than one copy per surface. Two definitions of what a
 * row contains would write different payloads under the same key, and a row
 * cached by the leaner one would render the other list without its criteria.
 */
@Injectable()
export class ArticleRowsCache {
  constructor(
    private readonly tecdoc: ArticleRowsTecDoc,
    private readonly cache: RedisCache,
  ) {}

  hydrate(articles: HydratableArticle[]): Promise<ArticleSummaryDto[]> {
    return this.cache.cachedMany<HydratableArticle, ArticleSummaryDto>({
      items: articles,
      ttl: ARTICLE_ROW_TTL,
      keyOf: articleRowKey,
      keyOfLoaded: articleRowKey,
      loadMissing: (missing) =>
        this.tecdoc.getArticleRowsByLegacyIds(hydrationIdsOf(missing)),
    });
  }
}

function articleRowKey(article: {
  brandId: string;
  articleNumber: string;
}): string {
  return `tecdoc:article-row:${article.brandId}:${article.articleNumber}`;
}

/**
 * One hydration id per article. A part catalogued in two roles carries one id
 * per role, and both resolve to the same article, so the second would buy a
 * duplicate row.
 */
function hydrationIdsOf(articles: HydratableArticle[]): number[] {
  return articles
    .map((article) => article.legacyArticleIds[0])
    .filter(
      (legacyArticleId): legacyArticleId is number =>
        legacyArticleId !== undefined,
    );
}
