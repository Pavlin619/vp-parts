import { articleIdentityKey } from '@vp-parts-shop/shared';
import { CrossReferenceCandidate } from '../../../tecdoc';

/** The part a cross-reference list was resolved for. */
export interface ViewedArticle {
  brandId: string;
  articleNumber: string;
}

/**
 * Keeps the candidates that declared *this* part interchangeable, dropping those
 * that merely share its digits.
 *
 * A comparable-number search matches a number against every supplier's
 * cross-reference list without regard to whose number it is, so searching A.B.S.
 * `16100` also returns MEAT & DORIA's air filter, which files the same number
 * against somebody else entirely. The row itself says which: each reference it
 * matched names the data supplier that filed it. Requiring that supplier to be
 * ours — and the number to be ours — is what turns a loose number match into
 * equivalence.
 *
 * When this empties the list, an empty list is the answer. A wrong substitute is
 * a part a mechanic fits to the wrong car.
 */
export function keepCandidatesCiting(
  candidates: CrossReferenceCandidate[],
  viewed: ViewedArticle,
): CrossReferenceCandidate[] {
  const wanted = normaliseNumber(viewed.articleNumber);

  return candidates.filter((candidate) =>
    candidate.citedNumbers.some(
      (cited) =>
        cited.brandId === viewed.brandId &&
        normaliseNumber(cited.articleNumber) === wanted,
    ),
  );
}

/**
 * Drops the part the search was run for, which comes back among its own
 * cross-references in roughly a quarter of sets (60 of 236 measured).
 *
 * Compared on `(brandId, articleNumber)` and never on the number alone: the number
 * alone would also drop the *other* supplier's part filed under it, which is a
 * genuine replacement — the KNECHT/MAHLE `KC 69` pair is exactly that case.
 *
 * Nothing else is removed. One supplier legitimately contributes several rows
 * under different numbers (495 of 542 sets measured) — a brand's standard and
 * premium versions both replace our part.
 */
export function dropViewedPart(
  candidates: CrossReferenceCandidate[],
  viewed: ViewedArticle,
): CrossReferenceCandidate[] {
  const dropped = identityOf(viewed);

  return candidates.filter((candidate) => identityOf(candidate) !== dropped);
}

function identityOf(article: ViewedArticle): string {
  return articleIdentityKey(article.brandId, article.articleNumber);
}

/**
 * TecDoc ignores punctuation and spacing on both sides of a number comparison,
 * so `16 100`, `16100` and `16.100` are one number to it and must be here too.
 */
function normaliseNumber(articleNumber: string): string {
  return articleNumber.replace(/[^a-z0-9]/gi, '').toUpperCase();
}
