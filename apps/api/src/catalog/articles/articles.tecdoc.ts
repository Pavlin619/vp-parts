import { Injectable, Logger } from '@nestjs/common';
import {
  ArticleDetailRead,
  CATALOGUE_WIDE_TREES,
  TecDocAssemblyGroupFacetCount,
  TecDocTransport,
  assemblyGroupPathsOf,
  genericArticleIdsOf,
  mapArticleImages,
  mapArticleSummary,
  mapOemNumbers,
} from '../../tecdoc';
import {
  ArticleLookupResponse,
  articleLookupPayload,
  requireArticle,
} from './article-lookup';

/**
 * TecDoc source for the single-article detail — a `getArticles` call selecting
 * one part, mapped for display by the shared {@link mapArticleSummary}.
 *
 * It takes a `brandId` (TecDoc's `dataSupplierId`) alongside the number,
 * because a number on its own is not an identity — see
 * {@link articleLookupPayload}.
 */
@Injectable()
export class ArticlesTecDoc {
  private readonly logger = new Logger(ArticlesTecDoc.name);

  constructor(private readonly transport: TecDocTransport) {}

  async getArticleDetails(
    brandId: number,
    articleNumber: string,
    // Reserved for the future per-vehicle fit lookup; fit is null until then.
    _vehicleId?: number,
  ): Promise<ArticleDetailRead> {
    const data = await this.transport.call<
      ArticleLookupResponse & {
        assemblyGroupFacets?: { counts: TecDocAssemblyGroupFacetCount[] };
      }
    >('getArticles', {
      ...articleLookupPayload(brandId, articleNumber),
      // The list flags plus OE numbers: this is the one read whose surface
      // renders them, and the one the part-numbers route reads them from.
      includeGenericArticles: true,
      includeImages: true,
      includeArticleCriteria: true,
      includeOEMNumbers: true,
      // The article's own place in the category tree, for the breadcrumb.
      // Scoped to one article, so it costs a facet over a single row: measured
      // at +986 bytes on a 9.5 KB response, with no second call. The tree has
      // to be named — see {@link CATALOGUE_WIDE_TREES}.
      assemblyGroupFacetOptions: {
        enabled: true,
        assemblyGroupType: CATALOGUE_WIDE_TREES,
      },
    });

    const article = requireArticle(data, articleNumber, this.logger);

    return {
      detail: {
        // The row summary (identity, brand, description, thumbnail, specs) is
        // shared with every list surface; the detail adds the image gallery and
        // the OE numbers, which are too bulky for a list to carry per row.
        ...mapArticleSummary(article),
        images: mapArticleImages(article.images),
        oemNumbers: mapOemNumbers(article.oemNumbers),
        categoryPaths: assemblyGroupPathsOf(data.assemblyGroupFacets?.counts),
      },
      genericArticleIds: genericArticleIdsOf(article),
    };
  }
}
