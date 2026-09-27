import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import { distanceInMeters, formatDistance, sortOfficesByDistance } from './office-distance'

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

const SOFIA = { latitude: 42.6977, longitude: 23.3219 }
const PLOVDIV = { latitude: 42.1354, longitude: 24.7453 }

describe('distanceInMeters', () => {
  it('measures the straight line over the earth between two points', () => {
    expect(distanceInMeters(SOFIA, PLOVDIV)).toBeCloseTo(132_522, -1)
  })

  it('is the same either way round and nothing to the point itself', () => {
    expect(distanceInMeters(PLOVDIV, SOFIA)).toBeCloseTo(distanceInMeters(SOFIA, PLOVDIV))
    expect(distanceInMeters(SOFIA, SOFIA)).toBe(0)
  })
})

describe('sortOfficesByDistance', () => {
  const far = office({ code: 'far', ...PLOVDIV })
  const near = office({ code: 'near', latitude: 42.69, longitude: 23.33 })
  const nearest = office({ code: 'nearest', ...SOFIA })

  it('puts the nearest office first', () => {
    const sorted = sortOfficesByDistance([far, near, nearest], SOFIA)

    expect(sorted.map(({ code }) => code)).toEqual(['nearest', 'near', 'far'])
  })

  it('leaves the offices it was given in their order', () => {
    const offices = [far, near, nearest]

    sortOfficesByDistance(offices, SOFIA)

    expect(offices.map(({ code }) => code)).toEqual(['far', 'near', 'nearest'])
  })

  it('keeps offices at the same distance in their order', () => {
    const first = office({ code: 'first', ...PLOVDIV })
    const second = office({ code: 'second', ...PLOVDIV })

    const sorted = sortOfficesByDistance([first, second], SOFIA)

    expect(sorted.map(({ code }) => code)).toEqual(['first', 'second'])
  })
})

describe('formatDistance', () => {
  it.each([
    [0, '0 м'],
    [348, '350 м'],
    [994, '990 м'],
    [996, '1 км'],
    [1_234, '1,2 км'],
    [9_960, '10 км'],
    [132_522, '133 км'],
  ])('writes %i m as %s', (meters, written) => {
    expect(formatDistance(meters)).toBe(written)
  })
})
