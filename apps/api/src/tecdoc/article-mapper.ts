import {
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  OemNumberDto,
  PaginatedCatalogArticlesDto,
  TechnicalSpecDto,
} from '@vp-parts-shop/shared';

/**
 * The subset of a TecDoc `getArticles` (`includeAll: true`) article record the
 * catalog surfaces consume. One shape backs the listing, search, substitutes,
 * and detail responses — they only differ in how the articles are selected, so
 * the mapper is shared by the articles and search TecDoc sources.
 */
export interface TecDocArticleRecord {
  articleNumber: string;
  /**
   * The brand, in TecDoc's own terms: the onboarding guide's catalogue-data
   * table lists it as `BrandId`, `getBrands` is keyed by it, and it is the only
   * brand axis `getArticles` can filter on (`dataSupplierIds`). The raw record
   * also carries an `mfrId` next to `mfrName` below, which looks like the
   * matching id for that name but belongs to a different id space that nothing
   * can be looked up by — hence it is not read at all.
   */
  dataSupplierId: number;
  mfrName: string;
  genericArticles?: Array<{
    /**
     * What the part *is* — "brake disc", "oil filter" — one level below the
     * assembly group holding it. `getArticles` filters on it
     * (`genericArticleIds`), which is how a cross-reference search is narrowed
     * to the viewed part's own type.
     */
    genericArticleId?: number;
    genericArticleDescription?: string;
    /**
     * TecDoc's legacy id for this article/generic-article pair, and the only id
     * the vehicle linkage lookup accepts. It is filed per generic article, not
     * per article, so a part covering two generic articles carries two of them.
     */
    legacyArticleId?: number;
  }>;
  /**
   * Cross-references: the numbers other suppliers declared interchangeable with
   * this article. Populated only by a search that matched one of them, and only
   * with `includeComparableNumbers` — the XSD's own note is "only populated if
   * the comparable numbers match the search query", and a brand-scoped lookup of
   * one part confirms it comes back empty.
   *
   * `dataSupplierId` is whose number was cited, in the same id space as our
   * `brandId`. The `mfrId` beside it is the other, unlookuppable space warned
   * about above, so provenance is read from `dataSupplierId` alone.
   */
  comparableNumbers?: Array<{
    articleNumber: string;
    dataSupplierId?: number;
    matchesSearchQuery?: boolean;
  }>;
  /** Present with `includeMisc`. See {@link ArticleStatus}. */
  misc?: { articleStatusId?: number };
  images?: Array<{ imageURL800?: string }>;
  articleCriteria?: Array<{
    criteriaId?: number;
    criteriaDescription: string;
    formattedValue: string;
    criteriaUnitDescription?: string;
    criteriaType?: string;
  }>;
  oemNumbers?: Array<{
    articleNumber: string;
    mfrName?: string;
    referenceTypeDescription?: string;
  }>;
}

/**
 * The `legacyArticleId`s one article resolves to, alongside the identity they
 * belong to.
 *
 * Carried beside the mapped rows rather than inside them: these are TecDoc's
 * internal linkage ids and {@link ArticleSummaryDto} deliberately exposes none
 * of them.
 */
export interface ArticleLinkageRoles {
  brandId: string;
  articleNumber: string;
  legacyArticleIds: number[];
}

/**
 * A mapped page of catalog rows and the linkage roles that came down with it.
 *
 * An `includeAll` response already carries every row's `genericArticles`, so
 * the ids the applicable-vehicles section needs are in hand the moment a
 * category page is read. Keeping them is what saves that section a
 * `getArticles` of its own per article.
 */
export interface CatalogArticlesPage {
  articles: PaginatedCatalogArticlesDto;
  roles: ArticleLinkageRoles[];
}

/**
 * One article's detail, plus what the DTO deliberately does not carry.
 *
 * `genericArticleIds` is TecDoc's answer to what the part *is*, and nothing
 * renders it — but the cross-reference search filters on it, and this read is
 * the only one that knows it. Carried beside the DTO rather than added to it,
 * the way {@link CatalogArticlesPage} carries linkage roles beside its rows: an
 * internal side-channel, not a new public field.
 */
export interface ArticleDetailRead {
  detail: ArticleCatalogDetailDto;
  genericArticleIds: number[];
}

/**
 * TecDoc files one `legacyArticleId` per article/generic-article pair rather
 * than one per part, so a part catalogued in two roles carries two — with its
 * vehicle linkages split across both.
 */
export function legacyArticleIdsOf(article: TecDocArticleRecord): number[] {
  return (article.genericArticles ?? [])
    .map((genericArticle) => genericArticle.legacyArticleId)
    .filter((articleId): articleId is number => articleId !== undefined);
}

/**
 * The generic articles a part is catalogued as. Filed per role like the legacy
 * ids above, so a part that is both a filter and part of a filter set carries
 * two — the first is the one a type-scoped search narrows to.
 */
export function genericArticleIdsOf(article: TecDocArticleRecord): number[] {
  return (article.genericArticles ?? [])
    .map((genericArticle) => genericArticle.genericArticleId)
    .filter((id): id is number => id !== undefined);
}

export function linkageRolesOf(
  article: TecDocArticleRecord,
): ArticleLinkageRoles {
  return {
    brandId: String(article.dataSupplierId),
    articleNumber: article.articleNumber,
    legacyArticleIds: legacyArticleIdsOf(article),
  };
}

/**
 * Maps a raw TecDoc `getArticles` article into the shared summary shape every
 * list surface renders. `brandLogoUrl` is joined later in the brands layer,
 * since `getArticles` carries no logo.
 *
 * OE numbers are deliberately absent: they are the bulkiest thing on an article
 * — 34 to 61 on a filter — and no list row shows them, so the list calls do not
 * request them and the numbers section reads them on demand instead.
 *
 * `fitsVehicle` stays null here by design. List surfaces are vehicle-agnostic —
 * resolving fit would cost a lookup per row — so no list client reads it; a
 * vehicle-scoped search instead narrows the results themselves via
 * `linkageTargetId`.
 *
 * TODO(vehicle-fit): resolve it for the single-article detail read, which is the
 * only surface that renders a fit verdict — `getArticleLinkedAllLinkingTarget4`
 * scoped to one `linkingTargetId` answers it with a single `linked` boolean.
 */
export function mapArticleSummary(
  article: TecDocArticleRecord,
): ArticleSummaryDto {
  return {
    articleNumber: article.articleNumber,
    brandId: String(article.dataSupplierId),
    brandName: article.mfrName,
    brandLogoUrl: null,
    description: article.genericArticles?.[0]?.genericArticleDescription ?? '',
    thumbnailUrl: article.images?.[0]?.imageURL800 ?? null,
    technicalSpecs: mapTechnicalSpecs(article.articleCriteria),
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
  const specs = (criteria ?? []).map((criterion) => ({
    key: criterion.criteriaDescription,
    value: criterion.formattedValue,
  }));

  return dedupeBy(specs, (spec) => [spec.key, spec.value]);
}

/**
 * TecDoc files an OE number once per vehicle manufacturer that uses it, so the
 * pair is the identity: one make listed twice is a repeat, two makes sharing a
 * number are two separate facts worth showing.
 */
export function mapOemNumbers(
  oemNumbers: TecDocArticleRecord['oemNumbers'],
): OemNumberDto[] {
  const numbers = (oemNumbers ?? []).map((oem) => ({
    articleNumber: oem.articleNumber,
    manufacturerName: oem.mfrName ?? null,
    interchangeability: oem.referenceTypeDescription ?? null,
  }));

  return dedupeBy(numbers, (oem) => [oem.manufacturerName, oem.articleNumber]);
}

function dedupeBy<T>(items: T[], identity: (item: T) => unknown[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = JSON.stringify(identity(item));

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
