import { Logger } from '@nestjs/common';
import { TecDocArticleRecord } from '../../tecdoc';
import { ArticleNotFoundException } from './article-not-found.exception';

/**
 * A `getArticles` response for the lookups that resolve one specific article.
 * `totalMatchingArticles` counts the whole match, not the page, which is what
 * lets {@link requireArticle} notice an ambiguous answer while still asking for
 * a single row.
 */
export interface ArticleLookupResponse {
  totalMatchingArticles?: number;
  articles?: TecDocArticleRecord[];
}

/**
 * The shared `getArticles` request for resolving one specific article. Used by
 * every read that means "this exact part", whichever feature asks.
 *
 * `dataSupplierIds` is what makes the lookup an identity rather than a guess:
 * an article number is unique only within a data supplier, so without it TecDoc
 * answers with every supplier filing that number and the first row wins by
 * accident. `searchMatchType` is the documented default, sent explicitly
 * because a lookup that quietly became a prefix match would resolve to a
 * different part altogether.
 */
export function articleLookupPayload(brandId: number, articleNumber: string) {
  return {
    articleCountry: 'BG',
    lang: 'bg',
    searchQuery: articleNumber,
    searchType: 0,
    searchMatchType: 'exact',
    dataSupplierIds: [brandId],
    // One row, because brand + exact number is meant to match exactly one and
    // these records are heavy (gallery, criteria, OE numbers). A wider page
    // would only be paid for on every read to discard the surplus; the count
    // below reports ambiguity for free.
    perPage: 1,
    page: 1,
  };
}

/**
 * The article a brand-scoped exact-number lookup found, or a 404.
 *
 * TecDoc answers a lookup that matched nothing with an absent collection rather
 * than an error, so without this an unknown number would read as an article
 * with undefined everything instead of {@link ArticleNotFoundException}.
 *
 * The warning covers the one case brand + number cannot: a supplier filing the
 * number under two of its own brands. Nothing here can tell which is meant, so
 * the row stands as returned — the log exists only to say whether that case is
 * real, since it would otherwise show a wrong part in silence. The caller
 * passes its own logger so the line names the read that hit it.
 */
export function requireArticle(
  data: ArticleLookupResponse,
  articleNumber: string,
  logger: Logger,
): TecDocArticleRecord {
  const article = data.articles?.[0];

  if (!article) {
    throw new ArticleNotFoundException();
  }

  if ((data.totalMatchingArticles ?? 1) > 1) {
    logger.warn(
      `Ambiguous lookup for article ${articleNumber} from data supplier ` +
        `${article.dataSupplierId}: ${data.totalMatchingArticles} records ` +
        'match. Using the first TecDoc returned.',
    );
  }

  return article;
}
