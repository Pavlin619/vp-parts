import { DeliveryDestinationType, ShippingMethod, type DeliveryQuoteDto, type ParcelEstimateDto } from '@vp-parts-shop/shared'
import { ApiError } from '@/lib/api'
import type { ParcelCheck } from './office-availability'
import type { CartTotals } from '@/lib/cart/cart-totals'
import { formatWeight, resolveDeliverySummary, summaryMoney } from './delivery-summary'

function parcel(overrides: Partial<ParcelEstimateDto> = {}): ParcelEstimateDto {
  return { weightGrams: 2300, isLockerEligible: true, ...overrides }
}

const OFFICE = { type: DeliveryDestinationType.OFFICE, officeCode: '1127' } as const
const ADDRESS = {
  type: DeliveryDestinationType.ADDRESS,
  address: { placeId: '41', street: 'бул. Витоша', streetNumber: '1' },
} as const

const READY: ParcelCheck = { state: 'ready', parcel: parcel() }

const QUOTE: DeliveryQuoteDto = {
  carrier: ShippingMethod.ECONT,
  destination: { type: DeliveryDestinationType.OFFICE, officeCode: '1127' },
  priceIncVatCents: 714,
  cashOnDeliveryFeeIncVatCents: null,
  expectedDeliveryDate: '2026-09-30',
  parcel: parcel(),
  cartVersion: 3,
  money: null,
}

type QuoteState = Parameters<typeof resolveDeliverySummary>[0]['quote']

function quoteState(overrides: Partial<NonNullable<QuoteState>> = {}): QuoteState {
  return { data: undefined, error: null, isPending: false, ...overrides }
}

describe('resolveDeliverySummary', () => {
  it('asks for a method before anything is priced', () => {
    expect(
      resolveDeliverySummary({ method: null, destination: null, parcelCheck: READY, quote: null, pickupReadyAt: null }),
    ).toEqual({ kind: 'awaiting-method' })
  })

  it('asks for an address before anything is priced', () => {
    expect(
      resolveDeliverySummary({ method: 'courier-address', destination: null, parcelCheck: READY, quote: null, pickupReadyAt: null }),
    ).toEqual({ kind: 'awaiting-address' })
  })

  it('prices an address like an office', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-address',
        destination: ADDRESS,
        parcelCheck: READY,
        quote: quoteState({ data: { ...QUOTE, destination: ADDRESS } }),
        pickupReadyAt: null,
      }),
    ).toEqual({
      kind: 'quoted',
      priceIncVatCents: 714,
      cashOnDeliveryFeeIncVatCents: null,
      expectedDeliveryDate: '2026-09-30',
      money: null,
    })
  })

  it.each(['DELIVERY_ADDRESS_REFUSED', 'DELIVERY_ADDRESS_NOT_SERVED'])(
    'asks to check the address when the quote says %s',
    (errorCode) => {
      expect(
        resolveDeliverySummary({
          method: 'courier-address',
          destination: ADDRESS,
          parcelCheck: READY,
          quote: quoteState({ error: new ApiError(422, errorCode) }),
          pickupReadyAt: null,
        }),
      ).toEqual({ kind: 'address-unusable' })
    },
  )

  it('asks for an office before anything is priced', () => {
    expect(
      resolveDeliverySummary({ method: 'courier-office', destination: null, parcelCheck: READY, quote: null, pickupReadyAt: null }),
    ).toEqual({ kind: 'awaiting-office' })
  })

  it('is pending while the parcel is being weighed', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-office',
        destination: OFFICE,
        parcelCheck: { state: 'checking' },
        quote: null,
        pickupReadyAt: null,
      }),
    ).toEqual({ kind: 'pending' })
  })

  it('fails when the parcel could not be weighed', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-office',
        destination: OFFICE,
        parcelCheck: { state: 'failed' },
        quote: null,
        pickupReadyAt: null,
      }),
    ).toEqual({ kind: 'failed' })
  })

  it('is pending while the quote is in flight', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-office',
        destination: OFFICE,
        parcelCheck: READY,
        quote: quoteState({ isPending: true }),
        pickupReadyAt: null,
      }),
    ).toEqual({ kind: 'pending' })
  })

  it('carries the quoted price and date', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-office',
        destination: OFFICE,
        parcelCheck: READY,
        quote: quoteState({ data: QUOTE }),
        pickupReadyAt: null,
      }),
    ).toEqual({
      kind: 'quoted',
      priceIncVatCents: 714,
      cashOnDeliveryFeeIncVatCents: null,
      expectedDeliveryDate: '2026-09-30',
      money: null,
    })
  })

  it('carries the fee for collecting the money on delivery', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-office',
        destination: OFFICE,
        parcelCheck: READY,
        quote: quoteState({ data: { ...QUOTE, cashOnDeliveryFeeIncVatCents: 152 } }),
        pickupReadyAt: null,
      }),
    ).toMatchObject({ kind: 'quoted', cashOnDeliveryFeeIncVatCents: 152 })
  })

  it.each(['DELIVERY_OFFICE_REFUSED', 'DELIVERY_LOCKER_INELIGIBLE', 'DELIVERY_OFFICE_NOT_FOUND'])(
    'asks for another office when the quote says %s',
    (errorCode) => {
      expect(
        resolveDeliverySummary({
          method: 'courier-office',
          destination: OFFICE,
          parcelCheck: READY,
          quote: quoteState({ error: new ApiError(422, errorCode) }),
          pickupReadyAt: null,
        }),
      ).toEqual({ kind: 'office-unusable' })
    },
  )

  it('fails on any other error', () => {
    expect(
      resolveDeliverySummary({
        method: 'courier-office',
        destination: OFFICE,
        parcelCheck: READY,
        quote: quoteState({ error: new ApiError(503, 'DELIVERY_UNAVAILABLE') }),
        pickupReadyAt: null,
      }),
    ).toEqual({ kind: 'failed' })
  })
  it('frees a store pickup and carries the day it is ready', () => {
    expect(
      resolveDeliverySummary({
        method: 'store-pickup',
        destination: null,
        parcelCheck: { state: 'failed' },
        quote: null,
        pickupReadyAt: '2026-07-02T06:00:00.000Z',
      }),
    ).toEqual({ kind: 'pickup', readyAt: '2026-07-02T06:00:00.000Z' })
  })
})

describe('summaryMoney', () => {
  const GOODS: CartTotals = {
    itemCount: 3,
    subtotalExVat: 7000,
    vatAmount: 1400,
    totalIncVat: 8400,
    hasUnpricedLines: false,
    hasBlockedLines: false,
  }

  const MONEY = {
    goodsTotal: 8400,
    deliveryPrice: 714,
    cashOnDeliveryFee: 152,
    total: 9266,
    netAmount: 7722,
    vatAmount: 1544,
  }

  function quoted(money: typeof MONEY | null) {
    return {
      kind: 'quoted' as const,
      priceIncVatCents: 714,
      cashOnDeliveryFeeIncVatCents: 152,
      expectedDeliveryDate: null,
      money,
    }
  }

  it('shows the quote’s money, with the VAT on the delivery, once one is priced', () => {
    expect(summaryMoney(GOODS, quoted(MONEY))).toEqual({
      netAmount: 7722,
      vatAmount: 1544,
      total: 9266,
      isDeliveryIncluded: true,
    })
  })

  it('shows the goods alone, without the delivery, while the quote carries no money', () => {
    expect(summaryMoney(GOODS, quoted(null))).toEqual({
      netAmount: 7000,
      vatAmount: 1400,
      total: 8400,
      isDeliveryIncluded: false,
    })
  })

  it('counts a store pickup, which costs nothing, as delivery included', () => {
    expect(summaryMoney(GOODS, { kind: 'pickup', readyAt: null })).toMatchObject({
      total: 8400,
      isDeliveryIncluded: true,
    })
  })

  it('leaves the goods alone while delivery has no price', () => {
    expect(summaryMoney(GOODS, { kind: 'failed' }).isDeliveryIncluded).toBe(false)
    expect(summaryMoney(GOODS, { kind: 'pending' }).total).toBe(8400)
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
