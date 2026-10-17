import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import {
  deliveryAddressPlacesQueryOptions,
  deliveryQuarterSuggestionsQueryOptions,
  deliveryStreetSuggestionsQueryOptions,
  validateDeliveryAddress,
  deliveryOfficesQueryOptions,
  deliveryPlacesQueryOptions,
  getDeliveryOffices,
  getDeliveryPlaces,
} from './delivery'
import { apiFetch } from './index'

jest.mock('./index', () => ({
  ...jest.requireActual('./index'),
  apiFetch: jest.fn(),
}))
const mockApiFetch = jest.mocked(apiFetch)

function office(overrides: Partial<DeliveryOfficeDto>): DeliveryOfficeDto {
  return {
    carrier: ShippingMethod.ECONT,
    code: '1000',
    name: 'Офис',
    placeId: '41',
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
})

describe('getDeliveryOffices', () => {
  it("reads the carrier's offices from the public endpoint", () => {
    getDeliveryOffices(ShippingMethod.ECONT)

    expect(mockApiFetch).toHaveBeenCalledWith('/delivery/offices?carrier=ECONT')
  })
})

describe('getDeliveryPlaces', () => {
  it("reads the carrier's places from the public endpoint", () => {
    getDeliveryPlaces(ShippingMethod.ECONT)

    expect(mockApiFetch).toHaveBeenCalledWith('/delivery/places?carrier=ECONT')
  })
})

describe('deliveryPlacesQueryOptions', () => {
  it('keys the list by carrier and keeps it for the hour the API caches it', () => {
    const options = deliveryPlacesQueryOptions(ShippingMethod.ECONT)

    expect(options.queryKey).toEqual(['delivery', 'places', ShippingMethod.ECONT])
    expect(options.staleTime).toBe(60 * 60 * 1000)
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

describe('address lookups', () => {
  it('reads the places a courier delivers to from the public endpoint', async () => {
    mockApiFetch.mockResolvedValue([])

    await deliveryAddressPlacesQueryOptions(ShippingMethod.ECONT).queryFn?.({} as never)

    expect(mockApiFetch).toHaveBeenCalledWith('/delivery/address-places?carrier=ECONT')
  })

  it('asks for streets of one place by what was typed', async () => {
    mockApiFetch.mockResolvedValue([])

    await deliveryStreetSuggestionsQueryOptions(ShippingMethod.ECONT, '41', 'витоша').queryFn?.(
      {} as never,
    )

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/delivery/streets?carrier=ECONT&placeId=41&q=%D0%B2%D0%B8%D1%82%D0%BE%D1%88%D0%B0',
    )
  })

  it('asks for quarters the same way', async () => {
    mockApiFetch.mockResolvedValue([])

    await deliveryQuarterSuggestionsQueryOptions(ShippingMethod.ECONT, '41', 'мла').queryFn?.(
      {} as never,
    )

    expect(mockApiFetch.mock.calls[0][0]).toMatch(/^\/delivery\/quarters\?carrier=ECONT&placeId=41&q=/)
  })

  it('does not ask until a place and a letter are given', () => {
    expect(deliveryStreetSuggestionsQueryOptions(ShippingMethod.ECONT, null, 'ви').enabled).toBe(false)
    expect(deliveryStreetSuggestionsQueryOptions(ShippingMethod.ECONT, '41', ' ').enabled).toBe(false)
    expect(deliveryStreetSuggestionsQueryOptions(ShippingMethod.ECONT, '41', 'ви').enabled).toBe(true)
  })

  it('validates an address with a post', () => {
    const address = { placeId: '41', street: 'бул. Витоша', streetNumber: '1' }

    validateDeliveryAddress({ carrier: ShippingMethod.ECONT, address })

    expect(mockApiFetch).toHaveBeenCalledWith('/delivery/address/validate', {
      method: 'POST',
      body: { carrier: ShippingMethod.ECONT, address },
    })
  })
})
