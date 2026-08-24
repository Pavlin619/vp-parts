import {
  ArticleInventoryDetailDto,
  deliveryBand,
  deliveryBandRank,
} from '@vp-parts-shop/shared';
import { ArticleStatus, CrossReferenceCandidate } from '../../../tecdoc';

/** The part a cross-reference list was resolved for. */
export interface ViewedArticle {
  brandId: string;
  articleNumber: string;
}

/** A slice of an ordered candidate set, plus the size of the whole. */
export interface CandidatePage {
  total: number;
  page: number;
  pageSize: number;
  items: CrossReferenceCandidate[];
}

/**
 * Live availability for the candidates, keyed by article number, or null when
 * the stock database could not be read.
 */
export type AvailabilityByNumber = Map<
  string,
  ArticleInventoryDetailDto
> | null;

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

/**
 * Orders the whole candidate set by what we can actually ship: in stock first,
 * fastest delivery band and then cheapest within that, and a part still in supply
 * ahead of a discontinued one among the rest.
 *
 * This is why the candidate set is read whole rather than a page at a time — a
 * sort on stock is only meaningful if the sort sees every candidate. The last
 * tiebreak is on catalogue data alone so that paging is deterministic: page 2
 * must not reshuffle against page 1 on the next request.
 *
 * `availability` is null when the stock read failed, which degrades the ordering
 * to catalogue data and leaves the list itself intact.
 */
export function orderByAvailability(
  candidates: CrossReferenceCandidate[],
  availability: AvailabilityByNumber,
): CrossReferenceCandidate[] {
  const ranked = candidates.map((candidate) => ({
    candidate,
    stock: availability?.get(candidate.articleNumber),
  }));

  ranked.sort((left, right) => {
    const byStock =
      stockRank(left.stock) - stockRank(right.stock) ||
      deliverySpeed(left.stock) - deliverySpeed(right.stock) ||
      price(left.stock) - price(right.stock) ||
      supplyRank(left.candidate) - supplyRank(right.candidate);

    return byStock !== 0
      ? byStock
      : catalogueOrder(left.candidate, right.candidate);
  });

  return ranked.map((entry) => entry.candidate);
}

export function pageOf(
  candidates: CrossReferenceCandidate[],
  page: number,
  pageSize: number,
): CandidatePage {
  const start = (page - 1) * pageSize;

  return {
    total: candidates.length,
    page,
    pageSize,
    items: candidates.slice(start, start + pageSize),
  };
}

function stockRank(stock: ArticleInventoryDetailDto | undefined): number {
  return stock?.available === true ? 0 : 1;
}

/**
 * The fastest delivery band any warehouse holding the part can meet.
 *
 * Ranked by band rather than by `deliveryWorkDays` because two warehouses both
 * file a nominal term of zero days: our own shelf, which ships now, and the
 * regional warehouse, which ships today only if the order beats the supplier's
 * cut-off. On days alone those tie and price decides, which lists them
 * interleaved under badges that promise different things.
 *
 * Taken as the minimum rather than the first entry so the ordering does not rest
 * on the inventory read's own warehouse order, and over stocked warehouses only,
 * so it ranks on the same row the badge is drawn from. A part nothing is known
 * about sorts last.
 */
function deliverySpeed(stock: ArticleInventoryDetailDto | undefined): number {
  const bands = (stock?.availabilityByWarehouse ?? [])
    .filter((warehouse) => warehouse.quantity > 0)
    .map((warehouse) => deliveryBandRank(deliveryBand(warehouse)));

  return bands.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...bands);
}

function price(stock: ArticleInventoryDetailDto | undefined): number {
  return stock?.bestPriceIncVat ?? Number.MAX_SAFE_INTEGER;
}

/** A part a supplier still ships, ahead of one nobody does. */
function supplyRank(candidate: CrossReferenceCandidate): number {
  return candidate.articleStatusId === ArticleStatus.Normal ? 0 : 1;
}

/**
 * Compared by code unit rather than by locale: this decides page boundaries, so
 * it has to be the same on every machine that serves a page of one list.
 */
function catalogueOrder(
  left: CrossReferenceCandidate,
  right: CrossReferenceCandidate,
): number {
  if (left.brandName !== right.brandName) {
    return left.brandName < right.brandName ? -1 : 1;
  }

  if (left.articleNumber === right.articleNumber) {
    return 0;
  }

  return left.articleNumber < right.articleNumber ? -1 : 1;
}

function identityOf(article: ViewedArticle): string {
  return `${article.brandId}:${article.articleNumber}`;
}

/**
 * TecDoc ignores punctuation and spacing on both sides of a number comparison,
 * so `16 100`, `16100` and `16.100` are one number to it and must be here too.
 */
function normaliseNumber(articleNumber: string): string {
  return articleNumber.replace(/[^a-z0-9]/gi, '').toUpperCase();
}
