import { Injectable, Logger } from '@nestjs/common';
import {
  ArticleDetailRead,
  CatalogArticlesPage,
  LinkageTargetType,
  TecDocTransport,
  TecDocArticleRecord,
  genericArticleIdsOf,
  linkageRolesOf,
  mapArticleSummary,
  mapOemNumbers,
} from '../../tecdoc';
import {
  ArticleLookupResponse,
  articleLookupPayload,
  requireArticle,
} from './article-lookup';

/**
 * TecDoc source for the article surfaces: the per-vehicle+category listing and
 * the single-article detail. Both are `getArticles` calls differing in how the
 * articles are selected and in how much of each one is asked for; the shared
 * {@link mapArticleSummary} maps every row meant for display.
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
      // Exactly what a listing row renders, and nothing more — the same set the
      // search payload asks for. `includeGenericArticles` doubles as the source
      // of the `legacyArticleId`s pinned for the applicable-vehicles section, so
      // keeping those costs no flag of its own.
      includeGenericArticles: true,
      includeImages: true,
      includeArticleCriteria: true,
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
  ): Promise<ArticleDetailRead> {
    const data = await this.transport.call<ArticleLookupResponse>(
      'getArticles',
      {
        ...articleLookupPayload(brandId, articleNumber),
        // The list flags plus OE numbers: this is the one read whose surface
        // renders them, and the one the part-numbers route reads them from.
        includeGenericArticles: true,
        includeImages: true,
        includeArticleCriteria: true,
        includeOEMNumbers: true,
      },
    );

    const article = requireArticle(data, articleNumber, this.logger);

    return {
      detail: {
        // The row summary (identity, brand, description, thumbnail, specs) is
        // shared with every list surface; the detail adds the image gallery and
        // the OE numbers, which are too bulky for a list to carry per row.
        ...mapArticleSummary(article),
        images: (article.images ?? [])
          .map((img) => img.imageURL800 ?? '')
          .filter(Boolean),
        oemNumbers: mapOemNumbers(article.oemNumbers),
      },
      genericArticleIds: genericArticleIdsOf(article),
    };
  }
}
