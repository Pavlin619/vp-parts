import { ArticleStatus, CrossReferenceCandidate } from '../../../tecdoc';
import { dropViewedPart, keepCandidatesCiting, pageOf } from './candidate-set';

const A_B_S = '220';
const MANN = '4';

function candidate(
  articleNumber: string,
  overrides: Partial<CrossReferenceCandidate> = {},
): CrossReferenceCandidate {
  return {
    brandId: '30',
    brandName: 'BOSCH',
    articleNumber,
    description: 'Спирачен диск',
    legacyArticleIds: [555],
    articleStatusId: ArticleStatus.Normal,
    citedNumbers: [],
    ...overrides,
  };
}

/** A candidate that declared the given brand's number interchangeable. */
function citing(
  articleNumber: string,
  cited: Array<{ brandId: string; articleNumber: string }>,
  overrides: Partial<CrossReferenceCandidate> = {},
): CrossReferenceCandidate {
  return candidate(articleNumber, { citedNumbers: cited, ...overrides });
}

function numbersOf(candidates: CrossReferenceCandidate[]): string[] {
  return candidates.map((entry) => entry.articleNumber);
}

describe('keepCandidatesCiting', () => {
  const viewed = { brandId: A_B_S, articleNumber: '16100' };

  it('keeps a candidate that cites the viewed part', () => {
    const candidates = [
      citing('DF4074', [{ brandId: A_B_S, articleNumber: '16100' }]),
    ];

    expect(numbersOf(keepCandidatesCiting(candidates, viewed))).toEqual([
      'DF4074',
    ]);
  });

  /**
   * The collision this filter exists for. A.B.S. `16100` is a brake disc, and
   * MEAT & DORIA files `16100` as an air filter — so a number search returns
   * both, and only the row that named A.B.S. is replacing our part.
   */
  it('drops a candidate that matched the same digits filed by another brand', () => {
    const candidates = [
      citing('DF4074', [{ brandId: A_B_S, articleNumber: '16100' }]),
      citing('16100', [{ brandId: MANN, articleNumber: '16100' }]),
    ];

    expect(numbersOf(keepCandidatesCiting(candidates, viewed))).toEqual([
      'DF4074',
    ]);
  });

  // TecDoc matches numbers with punctuation and spacing ignored on both sides,
  // so the citation may be filed under any spelling of our number.
  it('reads a citation punctuated differently as the same number', () => {
    const candidates = [
      citing('DF4074', [{ brandId: A_B_S, articleNumber: '16.100' }]),
    ];

    expect(keepCandidatesCiting(candidates, viewed)).toHaveLength(1);
  });

  /**
   * A supplier citing our brand for a different part of ours is not citing this
   * one. The search should not return such a row at all, but the reference
   * collection is the only evidence either way — so the check is on the number
   * as well as the brand.
   */
  it('drops a candidate citing our brand for a different part', () => {
    const candidates = [
      citing('DF4074', [{ brandId: A_B_S, articleNumber: '16200' }]),
    ];

    expect(keepCandidatesCiting(candidates, viewed)).toEqual([]);
  });

  it('keeps nothing when no candidate cites us', () => {
    expect(keepCandidatesCiting([candidate('DF4074')], viewed)).toEqual([]);
  });
});

describe('dropViewedPart', () => {
  const viewed = { brandId: '30', articleNumber: 'SRC' };

  // The comparable search answers with the searched part among the rest — 60 of
  // 236 sets measured — and a part is not its own substitute.
  it('drops the viewed part', () => {
    const kept = dropViewedPart([candidate('SRC'), candidate('A1')], viewed);

    expect(numbersOf(kept)).toEqual(['A1']);
  });

  it('keeps everything else in the order TecDoc returned it', () => {
    const kept = dropViewedPart(
      [candidate('A2'), candidate('A1'), candidate('A3')],
      viewed,
    );

    expect(numbersOf(kept)).toEqual(['A2', 'A1', 'A3']);
  });

  /**
   * The identity is brand and number together, which is what stops the viewed
   * part's number from dropping *another* supplier's part filed under it — the
   * KNECHT/MAHLE `KC 69` pair, where each is a genuine replacement for the other.
   */
  it('keeps a different brand filing the viewed number', () => {
    const kept = dropViewedPart(
      [candidate('SRC', { brandId: '287', brandName: 'MAHLE' })],
      viewed,
    );

    expect(kept.map((entry) => entry.brandName)).toEqual(['MAHLE']);
  });

  // One supplier files several numbers of the same part type — a standard and a
  // premium version — and both replace ours.
  it('keeps every row one brand contributes under different numbers', () => {
    const kept = dropViewedPart(
      [
        candidate('A1', { brandId: '101' }),
        candidate('A2', { brandId: '101' }),
      ],
      viewed,
    );

    expect(numbersOf(kept)).toEqual(['A1', 'A2']);
  });

  it('answers an empty read with an empty list', () => {
    expect(dropViewedPart([], viewed)).toEqual([]);
  });
});

describe('pageOf', () => {
  const candidates = Array.from({ length: 45 }, (_, index) =>
    candidate(`A${index}`),
  );

  it('reports the whole set beside the requested slice', () => {
    const page = pageOf(candidates, 2, 20);

    expect(page.total).toBe(45);
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(20);
    expect(numbersOf(page.items)).toEqual(
      Array.from({ length: 20 }, (_, index) => `A${index + 20}`),
    );
  });

  it('answers a page past the end with no items', () => {
    expect(pageOf(candidates, 9, 20).items).toEqual([]);
  });

  it('answers an empty set with an empty first page', () => {
    expect(pageOf([], 1, 20)).toEqual({
      total: 0,
      page: 1,
      pageSize: 20,
      items: [],
    });
  });
});
