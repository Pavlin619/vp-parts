import {
  ArticleInventoryDetailDto,
  WarehouseAvailabilityDto,
  articleIdentityKey,
} from '@vp-parts-shop/shared';
import { ArticleStatus } from '../../tecdoc';
import { OrderableArticle, orderByAvailability } from './article-ordering';

const BOSCH = '30';

function article(
  articleNumber: string,
  overrides: Partial<OrderableArticle> = {},
): OrderableArticle {
  return {
    brandId: BOSCH,
    brandName: 'BOSCH',
    articleNumber,
    articleStatusId: ArticleStatus.Normal,
    ...overrides,
  };
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

function numbersOf(articles: OrderableArticle[]): string[] {
  return articles.map((entry) => entry.articleNumber);
}

/**
 * Availability as the inventory read returns it — keyed by brand and number, not
 * by number alone. Every row here is BOSCH's, as {@link article} builds.
 */
function priced(
  entries: Array<[string, ArticleInventoryDetailDto]>,
): Map<string, ArticleInventoryDetailDto> {
  return new Map(
    entries.map(([articleNumber, detail]) => [
      articleIdentityKey(BOSCH, articleNumber),
      detail,
    ]),
  );
}

describe('orderByAvailability', () => {
  it('puts what we can ship before what we cannot', () => {
    const availability = priced([
      ['A1', OUT_OF_STOCK],
      ['A2', inStock(1, 4200)],
    ]);

    const ordered = orderByAvailability(
      [article('A1'), article('A2')],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['A2', 'A1']);
  });

  it('orders in-stock parts by soonest delivery, then by price', () => {
    const availability = priced([
      ['SLOW-CHEAP', inStock(3, 1000)],
      ['FAST-DEAR', inStock(0, 9000)],
      ['FAST-CHEAP', inStock(0, 5000)],
    ]);

    const ordered = orderByAvailability(
      [article('SLOW-CHEAP'), article('FAST-DEAR'), article('FAST-CHEAP')],
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
    const availability = priced([
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
      [article('SUPPLIER-CHEAP'), article('OURS-DEAR')],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['OURS-DEAR', 'SUPPLIER-CHEAP']);
  });

  // A warehouse we could ship from tomorrow is the answer even when a slower one
  // is listed first, so the delivery band is the fastest of them, not the first.
  it('takes the soonest of several warehouses', () => {
    const availability = priced([
      ['SPREAD', inStock(3, 4200, [warehouse(3), warehouse(1)])],
      ['SINGLE', inStock(2, 4200)],
    ]);

    const ordered = orderByAvailability(
      [article('SINGLE'), article('SPREAD')],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['SPREAD', 'SINGLE']);
  });

  // The badge is drawn from the fastest warehouse that actually holds stock, so
  // an empty one must not lend the row its speed.
  it('ignores a warehouse holding none of the part', () => {
    const availability = priced([
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
      [article('EMPTY-SHELF'), article('STOCKED')],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['STOCKED', 'EMPTY-SHELF']);
  });

  // Nothing to sort on, so this only decides which out-of-stock row a visitor
  // reads first: one a supplier still ships beats one nobody makes any more.
  it('puts a part still in supply before a discontinued one', () => {
    const availability = priced([
      ['GONE', OUT_OF_STOCK],
      ['MADE', OUT_OF_STOCK],
    ]);

    const ordered = orderByAvailability(
      [
        article('GONE', { articleStatusId: ArticleStatus.OutOfProduction }),
        article('MADE', { articleStatusId: ArticleStatus.Normal }),
      ],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['MADE', 'GONE']);
  });

  it('ranks a part TecDoc files no status for below one in normal supply', () => {
    const availability = priced([
      ['UNKNOWN', OUT_OF_STOCK],
      ['NORMAL', OUT_OF_STOCK],
    ]);

    const ordered = orderByAvailability(
      [
        article('UNKNOWN', { articleStatusId: null }),
        article('NORMAL', { articleStatusId: ArticleStatus.Normal }),
      ],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['NORMAL', 'UNKNOWN']);
  });

  // Page 2 must not reshuffle against page 1 on the next request, so nothing is
  // ever left to the order TecDoc happened to answer in.
  it('breaks every remaining tie on brand, then number', () => {
    const availability = priced([
      ['B2', inStock(1, 4200)],
      ['B1', inStock(1, 4200)],
      ['A1', inStock(1, 4200)],
    ]);

    const ordered = orderByAvailability(
      [
        article('B2', { brandName: 'ZF' }),
        article('A1', { brandName: 'ZF' }),
        article('B1', { brandName: 'ATE' }),
      ],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['B1', 'A1', 'B2']);
  });

  /**
   * A stock-DB outage degrades the ordering, never the list — the rows are
   * catalogue data and stand on their own. Status still applies: it comes from
   * the same read the rows did, which is unaffected.
   */
  it('orders on catalogue data alone when there is no availability', () => {
    const ordered = orderByAvailability(
      [
        article('GONE', {
          brandName: 'ATE',
          articleStatusId: ArticleStatus.NoLongerSupplied,
        }),
        article('MADE', { brandName: 'ZF' }),
      ],
      null,
    );

    expect(numbersOf(ordered)).toEqual(['MADE', 'GONE']);
  });

  // Every number is sent to the availability read, but a number with no inventory
  // row at all must not sort above one that has stock.
  it('treats a number the availability read did not answer for as out of stock', () => {
    const availability = priced([['STOCKED', inStock(2, 4200)]]);

    const ordered = orderByAvailability(
      [article('UNPRICED'), article('STOCKED')],
      availability,
    );

    expect(numbersOf(ordered)).toEqual(['STOCKED', 'UNPRICED']);
  });

  // Two suppliers filing one number are two parts, so the stock of one must not
  // lift the other up the list.
  it('does not price a row from another brand filing its number', () => {
    const availability = priced([['SHARED', inStock(0, 4200)]]);

    const ordered = orderByAvailability(
      [
        article('SHARED', { brandId: '4', brandName: 'MANN' }),
        article('OWN-STOCK'),
      ],
      new Map([
        ...availability,
        [articleIdentityKey(BOSCH, 'OWN-STOCK'), inStock(3, 9000)],
      ]),
    );

    expect(numbersOf(ordered)).toEqual(['OWN-STOCK', 'SHARED']);
  });

  it('leaves the input array untouched', () => {
    const articles = [article('A2'), article('A1')];

    orderByAvailability(articles, new Map());

    expect(numbersOf(articles)).toEqual(['A2', 'A1']);
  });

  /**
   * The point of the extraction: search results and cross-reference candidates
   * are different row types, and both are ordered by this one rule. Ordering a
   * row type that is neither must hand back that same type, fields intact.
   */
  it('orders any row carrying the identity and keeps its own fields', () => {
    interface SearchRow extends OrderableArticle {
      thumbnailUrl: string | null;
    }

    const rows: SearchRow[] = [
      { ...article('A1'), thumbnailUrl: null },
      { ...article('A2'), thumbnailUrl: 'https://cdn/a2.png' },
    ];

    const ordered = orderByAvailability(
      rows,
      priced([['A2', inStock(0, 1000)]]),
    );

    expect(ordered.map((row) => row.thumbnailUrl)).toEqual([
      'https://cdn/a2.png',
      null,
    ]);
  });
});
