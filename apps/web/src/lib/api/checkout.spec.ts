import { DeliveryDestinationType, ShippingMethod } from '@vp-parts-shop/shared'
import {
  deliveryQuoteQueryOptions,
  getDeliveryQuote,
  getParcelEstimate,
  parcelEstimateQueryOptions,
} from './checkout'
import { ApiError } from './index'
import { cartFetch } from './cart/cart-fetch'

jest.mock('./cart/cart-fetch')

const mockCartFetch = jest.mocked(cartFetch)

beforeEach(() => {
  mockCartFetch.mockReset()
})

describe('getParcelEstimate', () => {
  // The parcel is the requester's own selected lines, so the cart token has to travel.
  it("weighs the cart this device owns", () => {
    getParcelEstimate(ShippingMethod.ECONT)

    expect(mockCartFetch).toHaveBeenCalledWith('/checkout/parcel?carrier=ECONT')
  })
})

describe('parcelEstimateQueryOptions', () => {
  // A new cart version is a new parcel: a changed quantity or selection re-weighs it.
  it('keys the estimate by carrier, cart and cart version', () => {
    expect(
      parcelEstimateQueryOptions(ShippingMethod.ECONT, 'cart-1', 7).queryKey,
    ).toEqual(['checkout', 'parcel', ShippingMethod.ECONT, 'cart-1', 7])
  })

  // The account cart adopted at sign-in can share the guest cart's version number.
  it('keys two carts at the same version apart', () => {
    expect(
      parcelEstimateQueryOptions(ShippingMethod.ECONT, 'guest', 7).queryKey,
    ).not.toEqual(parcelEstimateQueryOptions(ShippingMethod.ECONT, 'account', 7).queryKey)
  })

  // Before the first write there is no cart to weigh, and the empty answer would never go stale.
  it('waits for the cart to exist', () => {
    expect(parcelEstimateQueryOptions(ShippingMethod.ECONT, '', 0).enabled).toBe(false)
    expect(parcelEstimateQueryOptions(ShippingMethod.ECONT, 'cart-1', 7).enabled).toBe(true)
  })

  it('queryFn weighs the cart', () => {
    parcelEstimateQueryOptions(ShippingMethod.ECONT, 'cart-1', 7).queryFn?.({} as never)

    expect(mockCartFetch).toHaveBeenCalledWith('/checkout/parcel?carrier=ECONT')
  })
})

const OFFICE = { type: DeliveryDestinationType.OFFICE, officeCode: '1127' } as const

describe('getDeliveryQuote', () => {
  // The server prices the cart it owns; the client names only the office.
  it('asks for the price of the cart this device owns to one office', () => {
    getDeliveryQuote({ carrier: ShippingMethod.ECONT, destination: OFFICE, isCashOnDelivery: true })

    expect(mockCartFetch).toHaveBeenCalledWith('/checkout/quote', {
      method: 'POST',
      body: { carrier: ShippingMethod.ECONT, destination: OFFICE, isCashOnDelivery: true },
    })
  })
})

describe('deliveryQuoteQueryOptions', () => {
  const request = { carrier: ShippingMethod.ECONT, destination: OFFICE, isCashOnDelivery: false }

  it('keys the quote by carrier, office, payment, cart and cart version', () => {
    expect(deliveryQuoteQueryOptions(request, 'cart-1', 7).queryKey).toEqual([
      'checkout',
      'quote',
      ShippingMethod.ECONT,
      OFFICE,
      false,
      'cart-1',
      7,
    ])
  })

  it('waits for the cart to exist', () => {
    expect(deliveryQuoteQueryOptions(request, '', 0).enabled).toBe(false)
    expect(deliveryQuoteQueryOptions(request, 'cart-1', 7).enabled).toBe(true)
  })

  // A refusal such as an office that cannot take the parcel is the same on a retry.
  it('does not retry a refusal, but retries an outage twice', () => {
    const { retry } = deliveryQuoteQueryOptions(request, 'cart-1', 7)
    const retryIf = retry as (count: number, error: Error) => boolean

    expect(retryIf(0, new ApiError(422, 'DELIVERY_OFFICE_REFUSED'))).toBe(false)
    expect(retryIf(0, new ApiError(503, 'DELIVERY_UNAVAILABLE'))).toBe(true)
    expect(retryIf(2, new ApiError(503, 'DELIVERY_UNAVAILABLE'))).toBe(false)
  })
})
