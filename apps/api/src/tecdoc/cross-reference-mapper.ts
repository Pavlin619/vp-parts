import {
  ArticleCandidate,
  TecDocArticleRecord,
  mapArticleCandidate,
} from './article-mapper';

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
 * A part that may replace another: an {@link ArticleCandidate} plus the one
 * thing only a comparable-number search can say about it.
 */
export interface CrossReferenceCandidate extends ArticleCandidate {
  /**
   * The references this row matched the search on, which is what decides whether
   * it replaces the viewed part or merely shares its digits — see
   * `keepCandidatesCiting`. Empty is possible and means the row is dropped: a
   * match TecDoc attributes to nobody cannot be shown as equivalent.
   */
  citedNumbers: CrossReferenceCitation[];
}

/**
 * Maps a `getArticles` row from the cheap cross-reference read: the candidate
 * includes plus `includeComparableNumbers`.
 */
export function mapCrossReferenceCandidate(
  article: TecDocArticleRecord,
): CrossReferenceCandidate {
  return {
    ...mapArticleCandidate(article),
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
