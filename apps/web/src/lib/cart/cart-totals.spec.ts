import {
  articleIdentityKey,
  type ArticleInventoryDetailDto,
  type ArticlesAvailabilityDto,
  type WarehouseAvailabilityDto,
  type WarehouseId,
} from '@vp-parts-shop/shared'
import type { CartLine } from '@/hooks/use-cart'
import { MAX_QUANTITY } from '@/lib/delivery/availability'
import { buildCartRows, cartTotals } from './cart-totals'

function warehouse(
  warehouseId: WarehouseId,
  quantity: number,
): WarehouseAvailabilityDto {
  return {
    warehouseId,
    quantity,
    deliveryWorkDays: 0,
    orderCutoffTime: '18:00',
    cutoffAt: '2099-06-25T15:00:00.000Z',
    pickup: { earliestAt: '2099-06-26T08:00:00.000Z', granularity: 'DAY' },
    courier: { earliestAt: '2099-06-27T08:00:00.000Z', granularity: 'DAY' },
  }
}

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    brandId: '268',
    articleNumber: 'WL6340',
    brandName: 'WIX',
    brandLogoUrl: null,
    description: 'Маслен филтър',
    thumbnailUrl: null,
    quantity: 1,
    isSelected: true,
    addedAtPriceIncVat: null,
    ...overrides,
  }
}

function detail(
  overrides: Partial<ArticleInventoryDetailDto> = {},
): ArticleInventoryDetailDto {
  return {
    available: true,
    bestPriceExVat: 1000,
    bestPriceIncVat: 1200,
    availabilityByWarehouse: [],
    computedAt: null,
    ...overrides,
  }
}

function availabilityOf(
  entries: [CartLine, ArticleInventoryDetailDto][],
): ArticlesAvailabilityDto {
  return Object.fromEntries(
    entries.map(([item, value]) => [
      articleIdentityKey(item.brandId, item.articleNumber),
      value,
    ]),
  )
}

describe('buildCartRows', () => {
  it('prices a line from the live availability read', () => {
    const item = line({ quantity: 3 })

    const [row] = buildCartRows([item], availabilityOf([[item, detail()]]))

    expect(row.unitPriceIncVat).toBe(1200)
    expect(row.lineTotalIncVat).toBe(3600)
    expect(row.lineTotalExVat).toBe(3000)
  })

  it('carries the pending state through so rows can skeleton', () => {
    const [row] = buildCartRows([line()], undefined)

    expect(row.availability).toBeUndefined()
    expect(row.unitPriceIncVat).toBeNull()
  })

  it('carries the failed state through rather than reading as out of stock', () => {
    const [row] = buildCartRows([line()], null)

    expect(row.availability).toBeNull()
    expect(row.lineTotalIncVat).toBeNull()
  })

  // A part that sold out has to stay visible for the customer to act on.
  it('keeps a line the availability read had no row for', () => {
    const rows = buildCartRows([line()], {})

    expect(rows).toHaveLength(1)
    expect(rows[0].availability?.available).toBe(false)
    expect(rows[0].unitPriceIncVat).toBeNull()
  })

  it('treats a half-priced line as unpriced, so VAT stays the difference', () => {
    const item = line()

    const [row] = buildCartRows(
      [item],
      availabilityOf([[item, detail({ bestPriceExVat: null })]]),
    )

    expect(row.unitPriceIncVat).toBeNull()
    expect(row.lineTotalIncVat).toBeNull()
  })

  it('matches on brand and number together', () => {
    const wix = line({ brandId: '268' })
    const bosch = line({ brandId: '77', brandName: 'BOSCH' })

    const rows = buildCartRows(
      [wix, bosch],
      availabilityOf([[wix, detail({ bestPriceIncVat: 1200 })]]),
    )

    expect(rows[0].unitPriceIncVat).toBe(1200)
    expect(rows[1].unitPriceIncVat).toBeNull()
  })
})

// A cart line outlives the stock it was added against, so every read is a
// chance for what the customer chose to stop being deliverable.
describe('buildCartRows — what the live read contradicts', () => {
  it('flags a line the read says we no longer stock', () => {
    const item = line({ quantity: 2 })

    const [row] = buildCartRows(
      [item],
      availabilityOf([[item, detail({ available: false })]]),
    )

    expect(row.issue).toBe('unavailable')
    expect(row.availableQuantity).toBe(0)
    expect(row.maxQuantity).toBe(0)
  })

  it('flags a line stock cannot cover, and says how deep it is', () => {
    const item = line({ quantity: 5 })

    const [row] = buildCartRows(
      [item],
      availabilityOf([
        [item, detail({ availabilityByWarehouse: [warehouse('CENTRAL', 2)] })],
      ]),
    )

    expect(row.issue).toBe('insufficient-stock')
    expect(row.availableQuantity).toBe(2)
    expect(row.maxQuantity).toBe(2)
  })

  it('leaves a line stock covers exactly alone', () => {
    const item = line({ quantity: 2 })

    const [row] = buildCartRows(
      [item],
      availabilityOf([
        [item, detail({ availabilityByWarehouse: [warehouse('CENTRAL', 2)] })],
      ]),
    )

    expect(row.issue).toBeNull()
  })

  // Null is not zero: capping a line on a figure we do not have would hold it
  // down for no reason, and warning on one would invent a problem.
  it.each([
    ['in flight', undefined],
    ['failed', null],
  ])('claims nothing about a read that is %s', (_label, availability) => {
    const [row] = buildCartRows([line({ quantity: 5 })], availability)

    expect(row.issue).toBeNull()
    expect(row.availableQuantity).toBeNull()
    expect(row.maxQuantity).toBe(MAX_QUANTITY)
  })

  // In stock, but the payload carries no breakdown — an empty warehouse list
  // here means "we cannot see the stock", not "there is none".
  it('claims nothing about an in-stock line with no per-warehouse breakdown', () => {
    const item = line({ quantity: 5 })

    const [row] = buildCartRows([item], availabilityOf([[item, detail()]]))

    expect(row.issue).toBeNull()
    expect(row.maxQuantity).toBe(MAX_QUANTITY)
  })

  it('caps the stepper at the absolute ceiling however deep the stock', () => {
    const item = line()

    const [row] = buildCartRows(
      [item],
      availabilityOf([
        [item, detail({ availabilityByWarehouse: [warehouse('CENTRAL', 500)] })],
      ]),
    )

    expect(row.maxQuantity).toBe(MAX_QUANTITY)
  })
})

describe('cartTotals', () => {
  it('sums the lines and derives VAT as the difference', () => {
    const filter = line({ quantity: 2 })
    const pads = line({ articleNumber: 'BP1234', quantity: 1 })

    const totals = cartTotals(
      buildCartRows(
        [filter, pads],
        availabilityOf([
          [filter, detail()],
          [pads, detail({ bestPriceExVat: 5000, bestPriceIncVat: 6000 })],
        ]),
      ),
    )

    expect(totals.itemCount).toBe(3)
    expect(totals.subtotalExVat).toBe(7000)
    expect(totals.totalIncVat).toBe(8400)
    expect(totals.vatAmount).toBe(1400)
    expect(totals.hasUnpricedLines).toBe(false)
    expect(totals.hasBlockedLines).toBe(false)
  })

  // The count is what "N артикула" says, so it covers lines we cannot price.
  it('counts unpriced lines but leaves them out of the money', () => {
    const priced = line({ quantity: 2 })
    const unpriced = line({ articleNumber: 'BP1234', quantity: 5 })

    const totals = cartTotals(
      buildCartRows(
        [priced, unpriced],
        availabilityOf([
          [priced, detail()],
          [unpriced, detail({ bestPriceExVat: null, bestPriceIncVat: null })],
        ]),
      ),
    )

    expect(totals.itemCount).toBe(7)
    expect(totals.totalIncVat).toBe(2400)
    expect(totals.hasUnpricedLines).toBe(true)
  })

  // The API quotes our own catalogue price for a part it has no stock for, so
  // a part we cannot ship arrives priced. Charging for it is the one thing the
  // summary must not do.
  it('leaves an unavailable line out of the money however well priced it is', () => {
    const shippable = line({ quantity: 2 })
    const gone = line({ articleNumber: 'BP1234', quantity: 3 })

    const totals = cartTotals(
      buildCartRows(
        [shippable, gone],
        availabilityOf([
          [shippable, detail()],
          [gone, detail({ available: false })],
        ]),
      ),
    )

    expect(totals.totalIncVat).toBe(2400)
    expect(totals.subtotalExVat).toBe(2000)
    expect(totals.hasBlockedLines).toBe(true)
  })

  it('leaves a line deeper than its stock out of the money', () => {
    const short = line({ quantity: 5 })

    const totals = cartTotals(
      buildCartRows(
        [short],
        availabilityOf([
          [short, detail({ availabilityByWarehouse: [warehouse('CENTRAL', 2)] })],
        ]),
      ),
    )

    expect(totals.totalIncVat).toBe(0)
    expect(totals.itemCount).toBe(5)
    expect(totals.hasBlockedLines).toBe(true)
  })

  it('reports zeroes for an empty cart', () => {
    expect(cartTotals([])).toEqual({
      itemCount: 0,
      subtotalExVat: 0,
      vatAmount: 0,
      totalIncVat: 0,
      hasUnpricedLines: false,
      hasBlockedLines: false,
    })
  })
})

// The line records the price the shopper was looking at when they added it,
// so the cart can point out that it has moved. The price shown is always live.
describe('priceChange', () => {
  /** The live read, quoting `incVat` for this exact line. */
  const priced = (item: CartLine, incVat: number) =>
    availabilityOf([
      [item, detail({ bestPriceIncVat: incVat, bestPriceExVat: incVat - 750 })],
    ])

  it('reports a rise since the part went in', () => {
    const item = line({ addedAtPriceIncVat: 4000 })

    const [row] = buildCartRows([item], priced(item, 4500))

    expect(row.priceChange).toBe(500)
  })

  it('reports a drop as a negative change', () => {
    const item = line({ addedAtPriceIncVat: 5000 })

    const [row] = buildCartRows([item], priced(item, 4500))

    expect(row.priceChange).toBe(-500)
  })

  it('says nothing when the price has not moved', () => {
    const item = line({ addedAtPriceIncVat: 4500 })

    const [row] = buildCartRows([item], priced(item, 4500))

    expect(row.priceChange).toBeNull()
  })

  it('says nothing for a line added without a price to compare against', () => {
    const item = line({ addedAtPriceIncVat: null })

    const [row] = buildCartRows([item], priced(item, 4500))

    expect(row.priceChange).toBeNull()
  })

  it('says nothing while the live price is still unknown', () => {
    const [row] = buildCartRows([line({ addedAtPriceIncVat: 4500 })], undefined)

    expect(row.priceChange).toBeNull()
  })
})
