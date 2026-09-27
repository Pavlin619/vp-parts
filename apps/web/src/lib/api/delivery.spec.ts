import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import {
  deliveryOfficesQueryOptions,
  getDeliveryOffices,
  getParcelEstimate,
  parcelEstimateQueryOptions,
} from './delivery'
import { apiFetch } from './index'
import { cartFetch } from './cart/cart-fetch'

jest.mock('./index')
jest.mock('./cart/cart-fetch')

const mockApiFetch = jest.mocked(apiFetch)
const mockCartFetch = jest.mocked(cartFetch)

function office(overrides: Partial<DeliveryOfficeDto>): DeliveryOfficeDto {
  return {
    carrier: ShippingMethod.ECONT,
    code: '1000',
    name: 'Офис',
    city: 'София',
    postCode: null,
    address: 'ул. Първа 1',
    latitude: 42.7,
    longitude: 23.3,
    type: DeliveryOfficeType.OFFICE,
    weekdayHours: null,
    saturdayHours: null,
    ...overrides,
  }
}

beforeEach(() => {
  mockApiFetch.mockReset()
  mockCartFetch.mockReset()
})

describe('getDeliveryOffices', () => {
  it("reads the carrier's offices from the public endpoint", () => {
    getDeliveryOffices(ShippingMethod.ECONT)

    expect(mockApiFetch).toHaveBeenCalledWith('/delivery/offices?carrier=ECONT')
  })
})

describe('getParcelEstimate', () => {
  // The parcel is the requester's own selected lines, so the cart token has to travel.
  it("weighs the cart this device owns", () => {
    getParcelEstimate(ShippingMethod.ECONT)

    expect(mockCartFetch).toHaveBeenCalledWith('/delivery/parcel?carrier=ECONT')
    expect(mockApiFetch).not.toHaveBeenCalled()
  })
})

describe('deliveryOfficesQueryOptions', () => {
  it('keys the list by carrier', () => {
    expect(deliveryOfficesQueryOptions(ShippingMethod.ECONT).queryKey).toEqual([
      'delivery',
      'offices',
      ShippingMethod.ECONT,
    ])
  })

  it('keeps the list for the hour the API caches it', () => {
    expect(deliveryOfficesQueryOptions(ShippingMethod.ECONT).staleTime).toBe(
      60 * 60 * 1000,
    )
  })

  it('sorts the offices by city, then by name, in Bulgarian order', () => {
    const select = deliveryOfficesQueryOptions(ShippingMethod.ECONT).select!
    const sorted = select([
      office({ code: '3', city: 'София', name: 'Младост' }),
      office({ code: '2', city: 'Бургас', name: 'Център' }),
      office({ code: '1', city: 'София', name: 'Банишора' }),
    ])

    expect(sorted.map(({ code }) => code)).toEqual(['2', '1', '3'])
  })
})

describe('parcelEstimateQueryOptions', () => {
  // A new cart version is a new parcel: a changed quantity or selection re-weighs it.
  it('keys the estimate by carrier, cart and cart version', () => {
    expect(
      parcelEstimateQueryOptions(ShippingMethod.ECONT, 'cart-1', 7).queryKey,
    ).toEqual(['delivery', 'parcel', ShippingMethod.ECONT, 'cart-1', 7])
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

    expect(mockCartFetch).toHaveBeenCalledWith('/delivery/parcel?carrier=ECONT')
  })
})
