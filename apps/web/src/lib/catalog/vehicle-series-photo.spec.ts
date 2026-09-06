import type { VehicleVariantDto } from '@vp-parts-shop/shared'
import { seriesPhotoUrlOf } from './vehicle-series-photo'

function variant(
  vehicleId: string,
  imageUrl: string | null,
): VehicleVariantDto {
  return {
    vehicleId,
    seriesId: 's3',
    name: '320 d',
    engine: 'N47D20C',
    powerKw: 135,
    powerHp: 184,
    displacementLiters: 2,
    yearFrom: 2011,
    yearTo: 2019,
    fuelType: 'Diesel',
    bodyType: 'Saloon',
    imageUrl,
    kbaNumbers: [],
  }
}

describe('seriesPhotoUrlOf', () => {
  it('reads the photo off whichever variant carries one', () => {
    const url = seriesPhotoUrlOf([
      variant('v-1', null),
      variant('v-2', null),
      variant('v-3', 'https://tecdoc.test/e90.jpg'),
    ])

    expect(url).toBe('https://tecdoc.test/e90.jpg')
  })

  // The photo is a property of the series, so every variant that carries one
  // carries the same one. Taking the first is therefore a shortcut, not a pick.
  it('takes the first of several', () => {
    const url = seriesPhotoUrlOf([
      variant('v-1', 'https://tecdoc.test/first.jpg'),
      variant('v-2', 'https://tecdoc.test/second.jpg'),
    ])

    expect(url).toBe('https://tecdoc.test/first.jpg')
  })

  // Between a fifth and nearly half of series file no photo at all, so this is
  // the ordinary case rather than an error one.
  it('answers null for a series that files none', () => {
    expect(seriesPhotoUrlOf([variant('v-1', null)])).toBeNull()
  })

  it('answers null before any variant has loaded', () => {
    expect(seriesPhotoUrlOf([])).toBeNull()
  })
})
