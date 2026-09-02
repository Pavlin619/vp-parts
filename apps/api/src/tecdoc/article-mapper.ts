import {
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  OemNumberDto,
  PaginatedCatalogArticlesDto,
  TechnicalSpecDto,
} from '@vp-parts-shop/shared';

/**
 * The subset of a TecDoc `getArticles` article record the catalog surfaces
 * consume. One shape backs the listing, search, substitutes, and detail
 * responses — they differ in how the articles are selected and in which include
 * flags they set, so the mapper is shared by the articles and search TecDoc
 * sources.
 *
 * Every field below is optional because every one of them is behind a flag: a
 * caller that does not ask for images gets no `images` key at all, not an empty
 * one. Each field names the flag that carries it.
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
 * `misc.articleStatusId`, from the Article Status key table. Only `Normal` says
 * a supplier still ships the part; the rest are ordering inputs, never filters —
 * a part out of production that we hold in stock is a part we can sell, and
 * filtering it out upstream would hide it.
 */
export enum ArticleStatus {
  InPreparation = 0,
  Normal = 1,
  NotSupplied = 2,
  OutOfProduction = 8,
  NoLongerSupplied = 9,
  OnRequest = 11,
}

/**
 * An article as it comes back from a cheap, whole-set read: its identity, what
 * it is, whether it is still supplied, and the id it can be hydrated by.
 *
 * Deliberately not an `ArticleSummaryDto`. A set read whole — every match of a
 * search, every cross-reference of a part — costs under a kilobyte per row this
 * way against ten times that hydrated, so the set is enumerated as candidates,
 * ranked and paged, and only the page a visitor reached is turned into rendered
 * rows by `ArticleRowsCache`.
 *
 * The three includes that fill it are `includeGenericArticles` (the description
 * and the legacy ids) and `includeMisc` (the status). Nothing here may depend on
 * criteria, images or OE numbers.
 */
export interface ArticleCandidate {
  brandId: string;
  brandName: string;
  articleNumber: string;
  description: string;
  legacyArticleIds: number[];
  /** Null when TecDoc files no status, which is not the same as `Normal`. */
  articleStatusId: number | null;
}

export function mapArticleCandidate(
  article: TecDocArticleRecord,
): ArticleCandidate {
  return {
    brandId: String(article.dataSupplierId),
    brandName: article.mfrName,
    articleNumber: article.articleNumber,
    description: article.genericArticles?.[0]?.genericArticleDescription ?? '',
    legacyArticleIds: legacyArticleIdsOf(article),
    articleStatusId: article.misc?.articleStatusId ?? null,
  };
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
 * `includeGenericArticles` is what a listing already sets to name each row, and
 * the same field carries these ids — so they are in hand the moment a category
 * page is read. Keeping them is what saves the applicable-vehicles section a
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
 * The gallery images, deduped on the URL. One URL is one photograph, so a
 * repeat — and TecDoc does file them, the same way it repeats a criterion — is a
 * duplicate thumbnail rather than a second view of the part.
 */
export function mapArticleImages(
  images: TecDocArticleRecord['images'],
): string[] {
  const urls = (images ?? [])
    .map((image) => image.imageURL800 ?? '')
    .filter(Boolean);

  return dedupeBy(urls, (url) => [url]);
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
