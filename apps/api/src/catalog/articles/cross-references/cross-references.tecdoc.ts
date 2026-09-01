import { Injectable, Logger } from '@nestjs/common';
import {
  CrossReferenceCandidate,
  TecDocTransport,
  TecDocArticleRecord,
  mapCrossReferenceCandidate,
} from '../../../tecdoc';

/**
 * How many candidates one cross-reference read asks for — TecDoc's own `perPage`
 * maximum, which it states when refused: `Field 'perPage' must be > 0 and <=
 * 1000`. So there is no page size left to raise, and this is a bound rather than
 * a tuning knob.
 *
 * It is also comfortably past the data. Measured over 418 parts in four part
 * types, candidate sets run to a median of 99 and a p90 of 206, and the widest
 * found is BREMBO `P 85 020` at 354 (341 KB). `perPage` is a cap and not a fetch
 * size — a 58-row set costs the same at 1000 as at 250 — so the wide case is paid
 * for only by the parts that are wide.
 */
export const CANDIDATE_LIMIT = 1000;

/**
 * `searchType` values from the `getArticles` enumeration in the XSD:
 * 0 Article Number, 1 OE Number, 2 Trade Number, 3 Comparable Number,
 * 4 Replacement, 5 Replaced, 6 EAN, 7 Criteria, 10 Any Number, 99 Free Text.
 */
export const COMPARABLE_NUMBER_SEARCH_TYPE = 3;

/** A candidate read: the rows, plus what the whole match measures. */
interface CandidateResponse {
  totalMatchingArticles?: number;
  articles?: TecDocArticleRecord[];
}

/**
 * The search that finds every candidate. Rendering the page a visitor reached is
 * the other half and belongs to no one surface, so it lives in
 * `ArticleRowsTecDoc` — the point of that split being how much of each article
 * is asked for, not which articles.
 */
@Injectable()
export class CrossReferencesTecDoc {
  private readonly logger = new Logger(CrossReferencesTecDoc.name);

  constructor(private readonly transport: TecDocTransport) {}

  /**
   * Every part another supplier declared interchangeable with this one — the
   * cross-reference index, read whole.
   *
   * This is the one call that can answer "what replaces this part". TecDoc
   * exposes no read that returns a part's own cross-reference list:
   * `comparableNumbers` is populated only for references that matched the search
   * query, so equivalence is reachable only by searching a number. Searching our
   * own number here is what makes the whole set arrive at once, rather than one
   * search per OE number with recall hostage to which number was filed first.
   *
   * Two things keep it precise, both free and both in the same response.
   * `genericArticleIds` narrows to the viewed part's own type server-side (A.B.S.
   * `16100`: 269 candidates down to 58 brake discs). And every row reports whose
   * number it matched, which `keepCandidatesCiting` then checks — because this
   * search matches a number without regard to whose it is, and a plain
   * comparable-number search is unusable without that check.
   */
  async getCrossReferenceCandidates(
    articleNumber: string,
    genericArticleId: number,
  ): Promise<CrossReferenceCandidate[]> {
    const data = await this.transport.call<CandidateResponse>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      searchQuery: articleNumber,
      searchType: COMPARABLE_NUMBER_SEARCH_TYPE,
      searchMatchType: 'exact',
      genericArticleIds: [genericArticleId],
      perPage: CANDIDATE_LIMIT,
      page: 1,
      includeGenericArticles: true,
      includeComparableNumbers: true,
      includeMisc: true,
    });

    const records = data.articles ?? [];

    this.warnIfTruncated(articleNumber, records.length, data);

    return records.map(mapCrossReferenceCandidate);
  }

  /**
   * A set past {@link CANDIDATE_LIMIT} is truncated, and only this says so. It
   * matters because the ordering step ranks what it is given: a silent cut would
   * let the parts we stock be the ones missing, which is the failure the previous
   * design was replaced for. Paging instead would be machinery for a case three
   * times wider than anything in the data, whose own ceiling would only be a
   * larger guess.
   */
  private warnIfTruncated(
    articleNumber: string,
    read: number,
    data: CandidateResponse,
  ): void {
    const matches = data.totalMatchingArticles ?? read;

    if (matches <= read) {
      return;
    }

    this.logger.warn(
      `Cross-reference set truncated for "${articleNumber}": ${matches} ` +
        `matches against TecDoc's ${CANDIDATE_LIMIT}-row ceiling, so the ` +
        'ordering no longer sees every candidate',
    );
  }
}
