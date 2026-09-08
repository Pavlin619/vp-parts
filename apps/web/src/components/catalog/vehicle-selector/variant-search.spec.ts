import type { VehicleVariantDto } from '@vp-parts-shop/shared'
import { matchesVariantSearch } from './variant-search'

function variant(overrides: Partial<VehicleVariantDto> = {}): VehicleVariantDto {
  return {
    vehicleId: 'v-320d',
    seriesId: 's3',
    name: '320 d',
    engineCodes: ['N47 D20 C'],
    powerKw: 135,
    powerHp: 184,
    displacementLiters: 2,
    yearFrom: 2012,
    yearTo: 2019,
    fuelType: 'Дизел',
    bodyType: 'Седан',
    imageUrl: null,
    kbaNumbers: ['0005BGJ'],
    ...overrides,
  }
}

describe('matchesVariantSearch', () => {
  it('keeps every variant while nothing has been typed', () => {
    expect(matchesVariantSearch(variant(), '')).toBe(true)
    expect(matchesVariantSearch(variant(), '   ')).toBe(true)
  })

  it('matches the variant name whatever case it is typed in', () => {
    expect(matchesVariantSearch(variant({ name: '2.0 TDI' }), 'tdi')).toBe(true)
  })

  it('does not match a query the variant answers nowhere', () => {
    expect(matchesVariantSearch(variant(), 'quattro')).toBe(false)
  })

  it('matches an engine code, which the name never contains', () => {
    // Measured over one series: the description carries the engine code in 0 of
    // its 28 variants, so the codes are the only place this can match.
    expect(matchesVariantSearch(variant({ name: '2.0 TDI' }), 'N47')).toBe(true)
  })

  // A third of variants are built with more than one engine and the list shows
  // them all, so a search that only reached the first would hide a row whose
  // code is on screen.
  it('matches an engine code other than the first', () => {
    const multiEngine = variant({ engineCodes: ['OM 642.852', 'OM 642.850'] })

    expect(matchesVariantSearch(multiEngine, 'OM 642.850')).toBe(true)
  })

  it('matches a type-approval number', () => {
    expect(matchesVariantSearch(variant(), '0005BGJ')).toBe(true)
  })

  // TecDoc spaces and dots an engine code and a visitor reads theirs off a
  // block or a document that may not, so neither side's punctuation decides
  // whether they find their car.
  it('ignores the spacing and punctuation on either side of the match', () => {
    const stored = variant({ engineCodes: ['OM 642.852'] })

    expect(matchesVariantSearch(stored, 'om642852')).toBe(true)
    expect(matchesVariantSearch(variant({ engineCodes: ['N47D20C'] }), 'n47 d20')).toBe(true)
  })
})
