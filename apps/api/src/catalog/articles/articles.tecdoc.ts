import { Injectable } from '@nestjs/common';
import {
  PaginatedCatalogArticlesDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
} from '@vp-parts-shop/shared';
import {
  TecDocTransport,
  TecDocArticleRecord,
  mapArticleSummary,
} from '../../tecdoc';

/**
 * Upper bound on comparable (cross-reference) articles fetched and returned for
 * a single part. Caps the TecDoc `getArticles` page size and the enriched list
 * so a part with hundreds of cross-references never floods the substitutes tab
 * or the bulk inventory lookup behind it.
 */
export const SUBSTITUTES_LIMIT = 20;

/**
 * TecDoc source for the article surfaces: the per-vehicle+category listing, the
 * single-article detail, and the comparable-number (cross-reference)
 * substitutes list. All are `getArticles` (`includeAll`) calls that differ only
 * in how the articles are selected; the shared {@link mapArticleSummary} maps
 * each row.
 */
@Injectable()
export class ArticlesTecDoc {
  constructor(private readonly transport: TecDocTransport) {}

  async getArticles(
    vehicleId: string,
    categoryId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedCatalogArticlesDto> {
    const data = await this.transport.call<{
      totalMatchingArticles: number;
      articles: TecDocArticleRecord[];
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      assemblyGroupNodeIds: Number(categoryId),
      linkageTargetType: 'P',
      linkageTargetId: Number(vehicleId),
      perPage: pageSize,
      page,
      includeAll: true,
    });

    return {
      total: data.totalMatchingArticles,
      page,
      pageSize,
      items: data.articles.map((article) => mapArticleSummary(article)),
    };
  }

  async getArticleDetails(
    articleNumber: string,
    // Reserved for the future per-vehicle fit lookup; fit is null until then.
    _vehicleId?: string,
  ): Promise<ArticleCatalogDetailDto> {
    const data = await this.transport.call<{
      articles: TecDocArticleRecord[];
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      searchQuery: articleNumber,
      searchType: 0,
      includeAll: true,
      perPage: 1,
      page: 1,
    });

    if (!data.articles || data.articles.length === 0) {
      throw new Error(`Article not found: ${articleNumber}`);
    }

    const article = data.articles[0];

    return {
      // The row summary (identity, brand, description, thumbnail, specs, OE)
      // is shared with every list surface; the detail adds the image gallery.
      ...mapArticleSummary(article),
      images: (article.images ?? [])
        .map((img) => img.imageURL800 ?? '')
        .filter(Boolean),
      // Compatible vehicles require a separate getArticleLinkedAllLinkingTarget4
      // call sequence — see TecDoc docs section 8.4. Populated by a future task.
      compatibleVehicles: [],
    };
  }

  /**
   * Comparable (cross-reference) articles for a part — "the same part from
   * other data suppliers". Uses `getArticles` with `searchType: 3` (Comparable
   * Number, per the Pegasus 3.0 Onboarding Guide §8.5). The searched article is
   * excluded and duplicates are removed; the page size is capped at
   * {@link SUBSTITUTES_LIMIT}.
   */
  async getSubstitutes(articleNumber: string): Promise<ArticleSummaryDto[]> {
    const data = await this.transport.call<{
      articles?: TecDocArticleRecord[];
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      searchQuery: articleNumber,
      searchType: 3,
      perPage: SUBSTITUTES_LIMIT,
      page: 1,
      includeAll: true,
    });

    const seen = new Set<string>([articleNumber]);
    const substitutes: ArticleSummaryDto[] = [];

    for (const article of data.articles ?? []) {
      if (seen.has(article.articleNumber)) continue;
      seen.add(article.articleNumber);

      substitutes.push(mapArticleSummary(article));
    }

    return substitutes;
  }
}
