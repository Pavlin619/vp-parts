import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import {
  EMPTY_OFFICE_SEARCH,
  filterOffices,
  suggestOffices,
  type OfficeSearch,
} from './office-search'

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

const MLADOST = office({
  code: '1',
  name: 'София Младост 1',
  city: 'София',
  postCode: '1784',
  address: 'бул. Александър Малинов 51',
})
const LOCKER = office({
  code: '2',
  name: 'Еконтомат Люлин',
  city: 'София',
  postCode: '1324',
  address: 'ж.к. Люлин 5',
  type: DeliveryOfficeType.LOCKER,
})
const PLOVDIV = office({
  code: '3',
  name: 'Пловдив Център',
  city: 'Пловдив',
  postCode: '4000',
  address: 'ул. Иван Вазов 12',
})
const OFFICES = [MLADOST, LOCKER, PLOVDIV]

const search = (overrides: Partial<OfficeSearch>): OfficeSearch => ({
  ...EMPTY_OFFICE_SEARCH,
  ...overrides,
})

describe('filterOffices', () => {
  it('returns every office for an empty search', () => {
    expect(filterOffices(OFFICES, search({ query: '  ' }))).toEqual(OFFICES)
  })

  it('matches the city, name, address and post code, ignoring case', () => {
    expect(filterOffices(OFFICES, search({ query: 'пловдив' }))).toEqual([PLOVDIV])
    expect(filterOffices(OFFICES, search({ query: 'МАЛИНОВ' }))).toEqual([MLADOST])
    expect(filterOffices(OFFICES, search({ query: '1324' }))).toEqual([LOCKER])
  })

  // "София Люлин" names a city and a district, which sit in different fields.
  it('requires every word to match, in any field', () => {
    expect(filterOffices(OFFICES, search({ query: 'софия люлин' }))).toEqual([LOCKER])
    expect(filterOffices(OFFICES, search({ query: 'пловдив люлин' }))).toEqual([])
  })

  it('narrows to one kind of pickup point', () => {
    expect(
      filterOffices(OFFICES, search({ type: DeliveryOfficeType.LOCKER })),
    ).toEqual([LOCKER])
    expect(
      filterOffices(OFFICES, search({ query: 'софия', type: DeliveryOfficeType.OFFICE })),
    ).toEqual([MLADOST])
  })
})

describe('suggestOffices', () => {
  it('suggests nothing for an empty query', () => {
    expect(suggestOffices(OFFICES, ' ')).toEqual([])
  })

  it('suggests offices matching every word of the query', () => {
    expect(suggestOffices(OFFICES, 'софия люлин')).toEqual([LOCKER])
  })

  it('suggests at most four', () => {
    const offices = Array.from({ length: 6 }, (_, index) =>
      office({ code: String(index), name: `Офис ${index}` }),
    )

    expect(suggestOffices(offices, 'офис')).toHaveLength(4)
  })
})
