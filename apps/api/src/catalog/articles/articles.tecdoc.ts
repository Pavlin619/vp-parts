import { Injectable, Logger } from '@nestjs/common';
import {
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
} from '@vp-parts-shop/shared';
import {
  CatalogArticlesPage,
  LinkageTargetType,
  TecDocTransport,
  TecDocArticleRecord,
  linkageRolesOf,
  mapArticleSummary,
} from '../../tecdoc';
import {
  ArticleLookupResponse,
  articleLookupPayload,
  requireArticle,
} from './article-lookup';

/**
 * How many comparable (cross-reference) articles one `getArticles` page asks
 * for. Sized to the list the substitutes tab shows, so a part with hundreds of
 * cross-references is not fetched whole only to have most of it discarded. How
 * many are shown is `SUBSTITUTES_LIMIT`, which belongs to the service that
 * decides it.
 */
export const COMPARABLE_PAGE_SIZE = 20;

/**
 * TecDoc source for the article surfaces: the per-vehicle+category listing, the
 * single-article detail, and the comparable-number (cross-reference) list. All
 * are `getArticles` (`includeAll`) calls that differ only in how the articles
 * are selected; the shared {@link mapArticleSummary} maps each row.
 *
 * The read that resolves one specific part takes a `brandId` (TecDoc's
 * `dataSupplierId`) alongside the number, because a number on its own is not an
 * identity — see {@link articleLookupPayload}.
 */
@Injectable()
export class ArticlesTecDoc {
  private readonly logger = new Logger(ArticlesTecDoc.name);

  constructor(private readonly transport: TecDocTransport) {}

  async getArticles(
    vehicleId: number,
    categoryId: number,
    page: number,
    pageSize: number,
  ): Promise<CatalogArticlesPage> {
    const data = await this.transport.call<{
      totalMatchingArticles: number;
      // Absent, not empty, when nothing matches — TecDoc omits the collection.
      articles?: TecDocArticleRecord[];
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      assemblyGroupNodeIds: categoryId,
      linkageTargetType: LinkageTargetType.Vehicle,
      linkageTargetId: vehicleId,
      perPage: pageSize,
      page,
      includeAll: true,
    });

    const records = data.articles ?? [];

    return {
      articles: {
        total: data.totalMatchingArticles,
        page,
        pageSize,
        items: records.map((article) => mapArticleSummary(article)),
      },
      roles: records.map((article) => linkageRolesOf(article)),
    };
  }

  async getArticleDetails(
    brandId: number,
    articleNumber: string,
    // Reserved for the future per-vehicle fit lookup; fit is null until then.
    _vehicleId?: number,
  ): Promise<ArticleCatalogDetailDto> {
    const data = await this.transport.call<ArticleLookupResponse>(
      'getArticles',
      {
        ...articleLookupPayload(brandId, articleNumber),
        includeAll: true,
      },
    );

    const article = requireArticle(data, articleNumber, this.logger);

    return {
      // The row summary (identity, brand, description, thumbnail, specs, OE)
      // is shared with every list surface; the detail adds the image gallery.
      ...mapArticleSummary(article),
      images: (article.images ?? [])
        .map((img) => img.imageURL800 ?? '')
        .filter(Boolean),
    };
  }

  /**
   * Comparable (cross-reference) articles for a part — "the same part from
   * other data suppliers". Uses `getArticles` with `searchType: 3` (Comparable
   * Number, per the Pegasus 3.0 Onboarding Guide §8.5).
   *
   * Keyed on the number alone, unlike the detail lookup above.
   * `dataSupplierIds` filters the *results*, not the search input, and TecDoc
   * offers no way to say "comparable to this number as filed by this brand" —
   * so sending a brand here would narrow the answer to the one brand we already
   * have, which is the opposite of a cross-reference list.
   *
   * Repeats are dropped on `(dataSupplierId, articleNumber)`: TecDoc lists the
   * same record more than once, and two suppliers answering with the same
   * number are two cross-references rather than a repeat. The searched article
   * comes back among them; excluding it is the service's call, not TecDoc's.
   *
   * TODO(substitutes-precision): consider passing `genericArticleIds` (taken
   * from the viewed article's `genericArticles`) to keep a cross-reference for a
   * different *kind* of part out of the list. Needs checking against real
   * TecDoc data first: generic articles are granular enough ("Oil Filter" vs
   * "Oil Filter Set") that a legitimate substitute filed one node over would
   * silently vanish, and a missing substitute is far harder to spot than a
   * wrong one. Diff the result sets with and without it before enabling.
   */
  async getComparableArticles(
    articleNumber: string,
  ): Promise<ArticleSummaryDto[]> {
    const data = await this.transport.call<{
      articles?: TecDocArticleRecord[];
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      searchQuery: articleNumber,
      searchType: 3,
      searchMatchType: 'exact',
      perPage: COMPARABLE_PAGE_SIZE,
      page: 1,
      includeAll: true,
    });

    const seen = new Set<string>();
    const comparable: ArticleSummaryDto[] = [];

    for (const article of data.articles ?? []) {
      const identity = `${article.dataSupplierId}:${article.articleNumber}`;
      if (seen.has(identity)) continue;
      seen.add(identity);

      comparable.push(mapArticleSummary(article));
    }

    return comparable;
  }
}
