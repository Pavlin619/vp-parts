import { ShippingMethod, type DeliveryQuoteDto, type ParcelEstimateDto } from '@vp-parts-shop/shared'
import { ApiError } from '@/lib/api'
import type { ParcelCheck } from './office-availability'
import { formatWeight, resolveDeliverySummary, summaryTotal } from './delivery-summary'

function parcel(overrides: Partial<ParcelEstimateDto> = {}): ParcelEstimateDto {
  return { weightGrams: 2300, unmeasuredArticles: [], isLockerEligible: true, ...overrides }
}

const READY: ParcelCheck = { state: 'ready', parcel: parcel() }

const QUOTE: DeliveryQuoteDto = {
  carrier: ShippingMethod.ECONT,
  officeCode: '1127',
  priceIncVatCents: 714,
  expectedDeliveryDate: '2026-09-30',
  parcel: parcel(),
  cartVersion: 3,
}

type QuoteState = Parameters<typeof resolveDeliverySummary>[0]['quote']

function quoteState(overrides: Partial<NonNullable<QuoteState>> = {}): QuoteState {
  return { data: undefined, error: null, isPending: false, ...overrides }
}

describe('resolveDeliverySummary', () => {
  it('leaves delivery to an address unpriced until addresses exist', () => {
    expect(
      resolveDeliverySummary({ method: 'courier-address', officeCode: null, parcelCheck: READY, quote: null }),
    ).toEqual({ kind: 'not-quoted' })
  })

  it('asks for an office before anything is priced', () => {
    expect(
      resolveDeliverySummary({ method: 'courier-office', officeCode: null, parcelCheck: READY, quote: null }),
    ).toEqual({ kind: 'awaiting-office' })
  })

  it('is pending while the parcel is being weighed', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-office',
        officeCode: '1127',
        parcelCheck: { state: 'checking' },
        quote: null,
      }),
    ).toEqual({ kind: 'pending' })
  })

  it('fails when the parcel could not be weighed', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-office',
        officeCode: '1127',
        parcelCheck: { state: 'failed' },
        quote: null,
      }),
    ).toEqual({ kind: 'failed' })
  })

  // A part with no weight is priced by phone; the quote is never asked.
  it('is priced by phone when a selected part has no weight', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-office',
        officeCode: '1127',
        parcelCheck: { state: 'ready', parcel: parcel({ weightGrams: null }) },
        quote: null,
      }),
    ).toEqual({ kind: 'by-phone' })
  })

  it('is pending while the quote is in flight', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-office',
        officeCode: '1127',
        parcelCheck: READY,
        quote: quoteState({ isPending: true }),
      }),
    ).toEqual({ kind: 'pending' })
  })

  it('carries the quoted price and date', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-office',
        officeCode: '1127',
        parcelCheck: READY,
        quote: quoteState({ data: QUOTE }),
      }),
    ).toEqual({ kind: 'quoted', priceIncVatCents: 714, expectedDeliveryDate: '2026-09-30' })
  })

  it.each(['DELIVERY_OFFICE_REFUSED', 'DELIVERY_LOCKER_INELIGIBLE', 'DELIVERY_OFFICE_NOT_FOUND'])(
    'asks for another office when the quote says %s',
    (errorCode) => {
      expect(
        resolveDeliverySummary({
          method: 'courier-office',
          officeCode: '1127',
          parcelCheck: READY,
          quote: quoteState({ error: new ApiError(422, errorCode) }),
        }),
      ).toEqual({ kind: 'office-unusable' })
    },
  )

  it('is priced by phone when the API says the parcel is unmeasured', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-office',
        officeCode: '1127',
        parcelCheck: READY,
        quote: quoteState({ error: new ApiError(422, 'DELIVERY_PARCEL_UNMEASURED') }),
      }),
    ).toEqual({ kind: 'by-phone' })
  })

  it('fails on any other error', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-office',
        officeCode: '1127',
        parcelCheck: READY,
        quote: quoteState({ error: new ApiError(503, 'DELIVERY_UNAVAILABLE') }),
      }),
    ).toEqual({ kind: 'failed' })
  })
})

describe('summaryTotal', () => {
  it('adds a quoted delivery to the goods', () => {
    expect(
      summaryTotal(8400, { kind: 'quoted', priceIncVatCents: 714, expectedDeliveryDate: null }),
    ).toBe(9114)
  })

  it('leaves the goods alone while delivery has no price', () => {
    expect(summaryTotal(8400, { kind: 'by-phone' })).toBe(8400)
    expect(summaryTotal(8400, { kind: 'pending' })).toBe(8400)
  })
})

describe('formatWeight', () => {
  it('reads under a kilo in grams', () => {
    expect(formatWeight(850)).toBe('850 г')
  })

  it('reads a kilo and over in kilograms with a decimal comma, dropping needless zeros', () => {
    expect(formatWeight(2300)).toBe('2,3 кг')
    expect(formatWeight(12000)).toBe('12 кг')
    expect(formatWeight(1234)).toBe('1,23 кг')
  })
})
