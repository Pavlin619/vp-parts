import {
  ArticleInventoryDetailDto,
  WarehouseAvailabilityDto,
} from '@vp-parts-shop/shared';
import { ArticleStatus, CrossReferenceCandidate } from '../../../tecdoc';
import {
  dropViewedPart,
  keepCandidatesCiting,
  orderByAvailability,
  pageOf,
} from './candidate-set';

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

/**
 * A supplier warehouse by default, so `deliveryWorkDays` still decides its band.
 * Our own `CENTRAL` shelf is the fastest band whatever term it files, which is
 * the distinction the ordering exists to make.
 */
function warehouse(
  deliveryWorkDays: number,
  overrides: Partial<WarehouseAvailabilityDto> = {},
): WarehouseAvailabilityDto {
  return {
    warehouseId: 'REGIONAL_2',
    quantity: 3,
    deliveryWorkDays,
    orderCutoffTime: '17:00',
    cutoffAt: '2026-08-23T14:00:00.000Z',
    pickup: { earliestAt: '2026-08-24T06:00:00.000Z', granularity: 'DAY' },
    courier: { earliestAt: '2026-08-25T06:00:00.000Z', granularity: 'DAY' },
    ...overrides,
  };
}

function inStock(
  deliveryWorkDays: number,
  bestPriceIncVat: number,
  warehouses: WarehouseAvailabilityDto[] = [warehouse(deliveryWorkDays)],
): ArticleInventoryDetailDto {
  return {
    available: true,
    bestPriceExVat: Math.round(bestPriceIncVat / 1.2),
    bestPriceIncVat,
    availabilityByWarehouse: warehouses,
    computedAt: '2026-08-23T12:00:00.000Z',
  };
}

const OUT_OF_STOCK: ArticleInventoryDetailDto = {
  available: false,
  bestPriceExVat: null,
  bestPriceIncVat: null,
  availabilityByWarehouse: [],
  computedAt: '2026-08-23T12:00:00.000Z',
};

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

describe('orderByAvailability', () => {
  it('puts what we can ship before what we cannot', () => {
    const availability = new Map([
      ['A1', OUT_OF_STOCK],
      ['A2', inStock(1, 4200)],
    ]);

    const ordered = orderByAvailability(
      [candidate('A1'), candidate('A2')],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['A2', 'A1']);
  });

  it('orders in-stock parts by soonest delivery, then by price', () => {
    const availability = new Map([
      ['SLOW-CHEAP', inStock(3, 1000)],
      ['FAST-DEAR', inStock(0, 9000)],
      ['FAST-CHEAP', inStock(0, 5000)],
    ]);

    const ordered = orderByAvailability(
      [
        candidate('SLOW-CHEAP'),
        candidate('FAST-DEAR'),
        candidate('FAST-CHEAP'),
      ],
      availability,
    );

    expect(numbersOf(ordered)).toEqual([
      'FAST-CHEAP',
      'FAST-DEAR',
      'SLOW-CHEAP',
    ]);
  });

  /**
   * Both warehouses promise nought working days, so the term alone cannot tell
   * them apart and the cheaper supplier part wins on price — which is what put a
   * "today if ordered by the cut-off" row above a part sitting on our own shelf.
   * The band separates them, and it outranks price.
   */
  it('puts stock on our own shelf above same-day supplier stock', () => {
    const availability = new Map([
      [
        'SUPPLIER-CHEAP',
        inStock(0, 890, [warehouse(0, { warehouseId: 'REGIONAL_1' })]),
      ],
      [
        'OURS-DEAR',
        inStock(0, 1530, [warehouse(0, { warehouseId: 'CENTRAL' })]),
      ],
    ]);

    const ordered = orderByAvailability(
      [candidate('SUPPLIER-CHEAP'), candidate('OURS-DEAR')],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['OURS-DEAR', 'SUPPLIER-CHEAP']);
  });

  // A warehouse we could ship from tomorrow is the answer even when a slower one
  // is listed first, so the delivery band is the fastest of them, not the first.
  it('takes the soonest of several warehouses', () => {
    const availability = new Map([
      ['SPREAD', inStock(3, 4200, [warehouse(3), warehouse(1)])],
      ['SINGLE', inStock(2, 4200)],
    ]);

    const ordered = orderByAvailability(
      [candidate('SINGLE'), candidate('SPREAD')],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['SPREAD', 'SINGLE']);
  });

  // The badge is drawn from the fastest warehouse that actually holds stock, so
  // an empty one must not lend the row its speed.
  it('ignores a warehouse holding none of the part', () => {
    const availability = new Map([
      [
        'EMPTY-SHELF',
        inStock(1, 4200, [
          warehouse(0, { warehouseId: 'CENTRAL', quantity: 0 }),
          warehouse(1),
        ]),
      ],
      ['STOCKED', inStock(0, 9900)],
    ]);

    const ordered = orderByAvailability(
      [candidate('EMPTY-SHELF'), candidate('STOCKED')],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['STOCKED', 'EMPTY-SHELF']);
  });

  // Nothing to sort on, so this only decides which out-of-stock row a visitor
  // reads first: one a supplier still ships beats one nobody makes any more.
  it('puts a part still in supply before a discontinued one', () => {
    const availability = new Map([
      ['GONE', OUT_OF_STOCK],
      ['MADE', OUT_OF_STOCK],
    ]);

    const ordered = orderByAvailability(
      [
        candidate('GONE', { articleStatusId: ArticleStatus.OutOfProduction }),
        candidate('MADE', { articleStatusId: ArticleStatus.Normal }),
      ],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['MADE', 'GONE']);
  });

  it('ranks a part TecDoc files no status for below one in normal supply', () => {
    const availability = new Map([
      ['UNKNOWN', OUT_OF_STOCK],
      ['NORMAL', OUT_OF_STOCK],
    ]);

    const ordered = orderByAvailability(
      [
        candidate('UNKNOWN', { articleStatusId: null }),
        candidate('NORMAL', { articleStatusId: ArticleStatus.Normal }),
      ],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['NORMAL', 'UNKNOWN']);
  });

  // Page 2 must not reshuffle against page 1 on the next request, so nothing is
  // ever left to the order TecDoc happened to answer in.
  it('breaks every remaining tie on brand, then number', () => {
    const availability = new Map([
      ['B2', inStock(1, 4200)],
      ['B1', inStock(1, 4200)],
      ['A1', inStock(1, 4200)],
    ]);

    const ordered = orderByAvailability(
      [
        candidate('B2', { brandName: 'ZF' }),
        candidate('A1', { brandName: 'ZF' }),
        candidate('B1', { brandName: 'ATE' }),
      ],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['B1', 'A1', 'B2']);
  });

  /**
   * A stock-DB outage degrades the ordering, never the list — the section is
   * catalogue data and stands on its own. Status still applies: it comes from
   * the candidate set, which is unaffected.
   */
  it('orders on catalogue data alone when there is no availability', () => {
    const ordered = orderByAvailability(
      [
        candidate('GONE', {
          brandName: 'ATE',
          articleStatusId: ArticleStatus.NoLongerSupplied,
        }),
        candidate('MADE', { brandName: 'ZF' }),
      ],
      null,
    );

    expect(numbersOf(ordered)).toEqual(['MADE', 'GONE']);
  });

  // Every candidate number is sent to the availability read, but a number with
  // no inventory row at all must not sort above one that has stock.
  it('treats a number the availability read did not answer for as out of stock', () => {
    const availability = new Map([['STOCKED', inStock(2, 4200)]]);

    const ordered = orderByAvailability(
      [candidate('UNPRICED'), candidate('STOCKED')],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['STOCKED', 'UNPRICED']);
  });

  it('leaves the input array untouched', () => {
    const candidates = [candidate('A2'), candidate('A1')];

    orderByAvailability(candidates, new Map());

    expect(numbersOf(candidates)).toEqual(['A2', 'A1']);
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
