import {
  DeliveryDestinationType,
  ShippingMethod,
  type CartTotalsDto,
} from '@vp-parts-shop/shared'
import {
  CHECKOUT_QUERY_KEY,
  DELIVERY_QUOTE_QUERY_KEY,
  checkoutTotalsQueryOptions,
  deliveryQuoteQueryOptions,
  getCheckoutTotals,
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

// A refused order re-reads the checkout's reads by these prefixes.
describe('checkout query keys', () => {
  it('keys every checkout read under one prefix', () => {
    const keys = [
      checkoutTotalsQueryOptions('cart-1', 7).queryKey,
      parcelEstimateQueryOptions(ShippingMethod.ECONT, 'cart-1', 7).queryKey,
      deliveryQuoteQueryOptions(null, 'cart-1', 7).queryKey,
    ]

    for (const key of keys) {
      expect(key.slice(0, CHECKOUT_QUERY_KEY.length)).toEqual([...CHECKOUT_QUERY_KEY])
    }
  })

  it('keys every quote under its own prefix', () => {
    expect(
      deliveryQuoteQueryOptions(null, 'cart-1', 7).queryKey.slice(0, DELIVERY_QUOTE_QUERY_KEY.length),
    ).toEqual([...DELIVERY_QUOTE_QUERY_KEY])
  })
})

describe('getCheckoutTotals', () => {
  it('prices the selected lines of the cart this device owns', () => {
    getCheckoutTotals()

    expect(mockCartFetch).toHaveBeenCalledWith('/checkout/totals')
  })
})

describe('checkoutTotalsQueryOptions', () => {
  // An edit raises the version, so the totals are re-read for every cart the customer looks at.
  it('keys the totals by cart and cart version', () => {
    expect(checkoutTotalsQueryOptions('cart-1', 7).queryKey).toEqual([
      'checkout',
      'totals',
      'cart-1',
      7,
    ])
  })

  it('waits for the cart to exist', () => {
    expect(checkoutTotalsQueryOptions('', 0).enabled).toBe(false)
    expect(checkoutTotalsQueryOptions('cart-1', 7).enabled).toBe(true)
  })

  it('queryFn prices the cart', () => {
    checkoutTotalsQueryOptions('cart-1', 7).queryFn?.({} as never)

    expect(mockCartFetch).toHaveBeenCalledWith('/checkout/totals')
  })

  describe('while a new version is read', () => {
    const PREVIOUS: CartTotalsDto = {
      cartVersion: 7,
      goodsTotal: 2400,
      netAmount: 2000,
      vatAmount: 400,
      total: 2400,
    }

    function placeholderFor(cartId: string, previousKey: readonly unknown[] | undefined) {
      const { placeholderData } = checkoutTotalsQueryOptions(cartId, 8)
      const previousQuery = previousKey ? ({ queryKey: previousKey } as never) : undefined

      return typeof placeholderData === 'function'
        ? placeholderData(PREVIOUS, previousQuery)
        : placeholderData
    }

    it('keeps the same cart’s last figures', () => {
      expect(placeholderFor('cart-1', ['checkout', 'totals', 'cart-1', 7])).toBe(PREVIOUS)
    })

    it('never shows another cart’s figures', () => {
      expect(placeholderFor('cart-2', ['checkout', 'totals', 'cart-1', 7])).toBeUndefined()
    })

    it('has nothing to show before a first read', () => {
      expect(placeholderFor('cart-1', undefined)).toBeUndefined()
    })
  })
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
