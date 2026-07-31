import { ArticleSummaryDto, TechnicalSpecDto } from '@vp-parts-shop/shared';

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
 * here. `brandLogoUrl` is joined later in the brands layer, since `getArticles`
 * carries no logo.
 *
 * `fitsVehicle` stays null here by design. List surfaces are vehicle-agnostic —
 * resolving fit would cost a lookup per row — so no list client reads it; a
 * vehicle-scoped search instead narrows the results themselves via
 * `linkageTargetId`.
 *
 * TODO(vehicle-fit): resolve it for the single-article detail read, which is the
 * only surface that renders a fit verdict
 * (`getArticleLinkedAllLinkingTarget4`, doc section 8.4).
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
    technicalSpecs: mapTechnicalSpecs(article.articleCriteria),
    oemNumbers: [
      ...new Set((article.oemNumbers ?? []).map((oem) => oem.articleNumber)),
    ],
    fitsVehicle: null,
  };
}

/**
 * A criterion can arrive more than once, since TecDoc lists it per data variant
 * of the article. Only an exact repeat is dropped: the same label with a
 * different value (two `Note` lines, say) is two distinct facts about the part.
 */
function mapTechnicalSpecs(
  criteria: TecDocArticleRecord['articleCriteria'],
): TechnicalSpecDto[] {
  const seen = new Set<string>();

  return (criteria ?? [])
    .map((criterion) => ({
      key: criterion.criteriaDescription,
      value: criterion.formattedValue,
    }))
    .filter((spec) => {
      const identity = JSON.stringify([spec.key, spec.value]);

      if (seen.has(identity)) {
        return false;
      }

      seen.add(identity);
      return true;
    });
}
