import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
  type DeliveryPlaceDto,
} from '@vp-parts-shop/shared'
import {
  nearbyOffices,
  placeOfOffice,
  placePoint,
  regionsOf,
  suggestPlaces,
} from './delivery-places'

function place(overrides: Partial<DeliveryPlaceDto>): DeliveryPlaceDto {
  return {
    carrier: ShippingMethod.ECONT,
    id: '1',
    name: 'Място',
    region: 'Плевен',
    postCode: '5800',
    servingOfficeCode: null,
    ...overrides,
  }
}

function office(overrides: Partial<DeliveryOfficeDto>): DeliveryOfficeDto {
  return {
    carrier: ShippingMethod.ECONT,
    code: '1000',
    name: 'Офис',
    placeId: '1',
    city: 'Плевен',
    postCode: null,
    address: 'ул. Първа 1',
    latitude: 43.4,
    longitude: 24.6,
    type: DeliveryOfficeType.OFFICE,
    weekdayHours: null,
    saturdayHours: null,
    ...overrides,
  }
}

const PLEVEN = place({ id: '1500', name: 'Плевен', postCode: '5800' })
const YASEN = place({ id: '27183', name: 'Ясен', postCode: '5850', servingOfficeCode: '5817' })

const PLEVEN_METRO = office({ code: '5817', placeId: '1500', latitude: 43.4, longitude: 24.6 })
const PLEVEN_CENTER = office({ code: '5800', placeId: '1500', latitude: 43.42, longitude: 24.62 })
const DOLNI_DABNIK = office({ code: '5870', placeId: '900', latitude: 43.4, longitude: 24.46 })
const SOFIA = office({ code: '1000', placeId: '41', latitude: 42.7, longitude: 23.32 })
const OFFICES = [SOFIA, DOLNI_DABNIK, PLEVEN_CENTER, PLEVEN_METRO]

describe('regionsOf', () => {
  it('lists each region once, in Bulgarian order', () => {
    const places = [
      place({ region: 'Софийска област' }),
      place({ region: 'Плевен' }),
      place({ region: 'Благоевград' }),
      place({ region: 'Плевен' }),
      place({ region: 'София-град' }),
    ]

    expect(regionsOf(places)).toEqual(['Благоевград', 'Плевен', 'Софийска област', 'София-град'])
  })
})

describe('suggestPlaces', () => {
  const places = [
    place({ id: '1', name: 'Горна Оряховица', region: 'Велико Търново', postCode: '5100' }),
    place({ id: '2', name: 'Оряхово', region: 'Враца', postCode: '3300' }),
    place({ id: '3', name: 'Оряховец', region: 'Кърджали', postCode: '6700', servingOfficeCode: '6600' }),
    place({ id: '4', name: 'Ясен', region: 'Плевен', postCode: '5850', servingOfficeCode: '5817' }),
    place({ id: '5', name: 'Ясен', region: 'Велико Търново', postCode: '5080', servingOfficeCode: '5000' }),
  ]
  const names = (suggested: DeliveryPlaceDto[]) => suggested.map(({ id }) => id)

  it('suggests nothing for an empty query', () => {
    expect(suggestPlaces(places, { query: ' ', region: null })).toEqual([])
  })

  it('puts places whose name starts with the query first, then towns with an office', () => {
    expect(names(suggestPlaces(places, { query: 'оря', region: null }))).toEqual(['2', '3', '1'])
  })

  it('matches regardless of case', () => {
    expect(names(suggestPlaces(places, { query: 'ЯСЕН', region: null }))).toEqual(['4', '5'])
  })

  it('keeps to the chosen region', () => {
    expect(names(suggestPlaces(places, { query: 'ясен', region: 'Плевен' }))).toEqual(['4'])
  })

  it('finds a place by the start of its post code', () => {
    expect(names(suggestPlaces(places, { query: '585', region: null }))).toEqual(['4'])
  })

  it('suggests at most eight', () => {
    const many = Array.from({ length: 12 }, (_, index) => place({ id: String(index), name: `Село ${index}` }))

    expect(suggestPlaces(many, { query: 'село', region: null })).toHaveLength(8)
  })
})

describe('placePoint', () => {
  it('stands a place with offices at the middle of its offices', () => {
    const point = placePoint(PLEVEN, OFFICES)

    expect(point?.latitude).toBeCloseTo(43.41)
    expect(point?.longitude).toBeCloseTo(24.61)
  })

  it('stands a village at the office that serves it', () => {
    expect(placePoint(YASEN, OFFICES)).toEqual({ latitude: 43.4, longitude: 24.6 })
  })

  it('has no point for a place none of the offices belongs to or serves', () => {
    expect(placePoint(place({ id: 'lost', servingOfficeCode: '0000' }), OFFICES)).toBeNull()
  })
})

describe('placeOfOffice', () => {
  it('finds the place an office stands in, or nothing', () => {
    expect(placeOfOffice([PLEVEN, YASEN], PLEVEN_METRO)).toBe(PLEVEN)
    expect(placeOfOffice([PLEVEN, YASEN], SOFIA)).toBeNull()
  })
})

describe('nearbyOffices', () => {
  const codes = (offices: DeliveryOfficeDto[]) => offices.map(({ code }) => code)

  it("keeps the place's own offices and those close by, nearest first", () => {
    const reference = { latitude: 43.405, longitude: 24.605 }

    expect(codes(nearbyOffices(OFFICES, { place: PLEVEN, reference }))).toEqual([
      '5817',
      '5800',
      '5870',
    ])
  })

  it('starts a village with the office that serves it', () => {
    const reference = { latitude: 43.4, longitude: 24.6 }

    expect(codes(nearbyOffices(OFFICES, { place: YASEN, reference }))[0]).toBe('5817')
  })

  it("keeps the place's own offices however far they are from the point", () => {
    const farAway = { latitude: 42.0, longitude: 27.0 }

    expect(codes(nearbyOffices(OFFICES, { place: PLEVEN, reference: farAway }))).toEqual(
      expect.arrayContaining(['5817', '5800']),
    )
  })

  it('keeps only the offices close to the point when no place is chosen', () => {
    const nearSofia = { latitude: 42.69, longitude: 23.33 }

    expect(codes(nearbyOffices(OFFICES, { place: null, reference: nearSofia }))).toEqual(['1000'])
  })

  it("keeps the place's offices in the order given without a point", () => {
    expect(codes(nearbyOffices(OFFICES, { place: PLEVEN, reference: null }))).toEqual([
      '5800',
      '5817',
    ])
  })
})
