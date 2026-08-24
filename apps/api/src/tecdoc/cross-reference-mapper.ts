import { TecDocArticleRecord, legacyArticleIdsOf } from './article-mapper';

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
 * One cross-reference a candidate cites: whose number it declared its part
 * interchangeable with. Only entries TecDoc attributes to a data supplier are
 * kept — an unattributed reference cannot support the provenance check that is
 * the whole precision story of the cross-reference read.
 */
export interface CrossReferenceCitation {
  brandId: string;
  articleNumber: string;
}

/**
 * A part that may replace another, before anything is known about it beyond its
 * identity.
 *
 * Deliberately not an `ArticleSummaryDto`: the cross-reference index is read
 * whole (hundreds of rows), so a candidate carries only what filtering, ordering
 * and the alternative-number chips need. The specs, thumbnail and OE numbers a
 * rendered row also wants cost ten times as much per row and are fetched by
 * `legacyArticleIds` for the page a visitor actually reaches.
 */
export interface CrossReferenceCandidate {
  brandId: string;
  brandName: string;
  articleNumber: string;
  description: string;
  legacyArticleIds: number[];
  /** Null when TecDoc files no status, which is not the same as `Normal`. */
  articleStatusId: number | null;
  /**
   * The references this row matched the search on, which is what decides whether
   * it replaces the viewed part or merely shares its digits — see
   * `keepCandidatesCiting`. Empty is possible and means the row is dropped: a
   * match TecDoc attributes to nobody cannot be shown as equivalent.
   */
  citedNumbers: CrossReferenceCitation[];
}

/**
 * Maps a `getArticles` row from the cheap cross-reference read: the light
 * includes only (`includeGenericArticles`, `includeComparableNumbers`,
 * `includeMisc`), so nothing here may depend on criteria, images or OE numbers.
 */
export function mapCrossReferenceCandidate(
  article: TecDocArticleRecord,
): CrossReferenceCandidate {
  return {
    brandId: String(article.dataSupplierId),
    brandName: article.mfrName,
    articleNumber: article.articleNumber,
    description: article.genericArticles?.[0]?.genericArticleDescription ?? '',
    legacyArticleIds: legacyArticleIdsOf(article),
    articleStatusId: article.misc?.articleStatusId ?? null,
    citedNumbers: citedNumbersOf(article),
  };
}

/**
 * The cross-references that matched the search, attributed to the brand that
 * filed them. `matchesSearchQuery` is honoured where TecDoc sends it: the XSD
 * says the collection holds matches only, but the flag exists, and a reference
 * to some other part of ours must not read as a reference to this one.
 */
function citedNumbersOf(
  article: TecDocArticleRecord,
): CrossReferenceCitation[] {
  return (article.comparableNumbers ?? [])
    .filter(
      (comparable) =>
        comparable.matchesSearchQuery !== false &&
        comparable.dataSupplierId !== undefined,
    )
    .map((comparable) => ({
      brandId: String(comparable.dataSupplierId),
      articleNumber: comparable.articleNumber,
    }));
}
