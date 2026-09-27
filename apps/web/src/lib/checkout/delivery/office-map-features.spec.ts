import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import {
  framingBounds,
  officeBounds,
  toLocationFeatures,
  toOfficeFeatures,
} from './office-map-features'

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

describe('toOfficeFeatures', () => {
  // GeoJSON orders a position longitude first, the reverse of how we say it.
  it('places each office at longitude, latitude with its code, carrier and type', () => {
    expect(
      toOfficeFeatures(
        [
          office({
            code: '1127',
            latitude: 42.69,
            longitude: 23.32,
            type: DeliveryOfficeType.LOCKER,
          }),
        ],
      ),
    ).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [23.32, 42.69] },
          properties: {
            code: '1127',
            carrier: ShippingMethod.ECONT,
            type: DeliveryOfficeType.LOCKER,
          },
        },
      ],
    })
  })
})

describe('officeBounds', () => {
  it('spans every office as south-west and north-east corners', () => {
    expect(
      officeBounds([
        office({ latitude: 42.1, longitude: 24.7 }),
        office({ latitude: 43.2, longitude: 23.3 }),
        office({ latitude: 42.5, longitude: 27.9 }),
      ]),
    ).toEqual([
      [23.3, 42.1],
      [27.9, 43.2],
    ])
  })

  it('has no bounds for no offices', () => {
    expect(officeBounds([])).toBeNull()
  })
})

describe('framingBounds', () => {
  const nearby = [
    office({ code: 'a', latitude: 42.70, longitude: 23.30 }),
    office({ code: 'b', latitude: 42.71, longitude: 23.31 }),
    office({ code: 'c', latitude: 42.72, longitude: 23.32 }),
    office({ code: 'd', latitude: 42.73, longitude: 23.33 }),
    office({ code: 'e', latitude: 42.74, longitude: 23.34 }),
    office({ code: 'f', latitude: 42.75, longitude: 23.35 }),
    office({ code: 'g', latitude: 42.76, longitude: 23.36 }),
    office({ code: 'h', latitude: 42.77, longitude: 23.37 }),
  ]
  const varna = office({ code: 'varna', latitude: 43.2, longitude: 27.9 })

  it('spans every office when there is no point to frame around', () => {
    expect(framingBounds([...nearby, varna], null)).toEqual([
      [23.3, 42.7],
      [27.9, 43.2],
    ])
  })

  it('spans the point and the offices nearest it, leaving the far ones out', () => {
    expect(framingBounds([varna, ...nearby], { latitude: 42.69, longitude: 23.29 })).toEqual([
      [23.29, 42.69],
      [23.37, 42.77],
    ])
  })

  it('spans only the point when there are no offices', () => {
    expect(framingBounds([], { latitude: 42.69, longitude: 23.29 })).toEqual([
      [23.29, 42.69],
      [23.29, 42.69],
    ])
  })
})

describe('toLocationFeatures', () => {
  it('places the point at longitude, latitude', () => {
    expect(toLocationFeatures({ latitude: 42.69, longitude: 23.32 })).toEqual({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [23.32, 42.69] }, properties: {} },
      ],
    })
  })

  it('is empty without a point', () => {
    expect(toLocationFeatures(null)).toEqual({ type: 'FeatureCollection', features: [] })
  })
})
