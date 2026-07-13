import { ArticleSummaryDto } from '@vp-parts-shop/shared';

/**
 * The subset of a TecDoc `getArticles` (`includeAll: true`) article record the
 * catalog surfaces consume. One shape backs the listing, search, substitutes,
 * and detail responses — they only differ in how the articles are selected, so
 * the mapper is shared by the articles and search TecDoc sources.
 */
export interface TecDocArticleRecord {
  articleNumber: string;
  mfrName: string;
  genericArticles?: Array<{ genericArticleDescription?: string }>;
  images?: Array<{ imageURL800?: string }>;
  articleCriteria?: Array<{
    criteriaId?: number;
    criteriaDescription: string;
    formattedValue: string;
    criteriaUnitDescription?: string;
    criteriaType?: string;
  }>;
  oemNumbers?: Array<{ articleNumber: string }>;
}

/**
 * Maps a raw TecDoc `getArticles` article into the shared summary shape every
 * list surface renders. Technical specs (`articleCriteria`) and OE numbers ride
 * along free on the same `includeAll` response, so they are always populated
 * here. `brandLogoUrl` is joined later in the brands layer (`getArticles`
 * carries no logo) and `fitsVehicle` is resolved per request, so both default
 * to null.
 */
export function mapArticleSummary(
  article: TecDocArticleRecord,
): ArticleSummaryDto {
  return {
    articleNumber: article.articleNumber,
    brandName: article.mfrName,
    brandLogoUrl: null,
    description: article.genericArticles?.[0]?.genericArticleDescription ?? '',
    thumbnailUrl: article.images?.[0]?.imageURL800 ?? null,
    technicalSpecs: (article.articleCriteria ?? []).map((criterion) => ({
      key: criterion.criteriaDescription,
      value: criterion.formattedValue,
    })),
    oemNumbers: (article.oemNumbers ?? []).map((oem) => oem.articleNumber),
    fitsVehicle: null,
  };
}
