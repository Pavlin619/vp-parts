import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import { officeBounds, toOfficeFeatures } from './office-map-features'

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
