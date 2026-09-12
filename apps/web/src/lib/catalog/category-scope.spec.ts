import type { SelectedVehicle } from '@/hooks/use-vehicle-context'
import { categoryScopeOf } from './category-scope'

const AUDI: SelectedVehicle = {
  vehicleId: '13074',
  manufacturerId: '5',
  seriesId: '2439',
  manufacturerName: 'AUDI',
  seriesName: 'A3 (8L1)',
  variantName: '1.8 T',
  engineCodes: ['AGU'],
  powerKw: 110,
  powerHp: 150,
  yearFrom: 1996,
  yearTo: 2003,
}

describe('categoryScopeOf', () => {
  it('names the car by make and series', () => {
    expect(categoryScopeOf(AUDI)).toEqual({
      vehicleId: '13074',
      vehicleName: 'AUDI A3 (8L1)',
    })
  })

  // The absence is the catalogue-wide tree, which is a scope the page renders
  // rather than a value it waits for.
  it('is null without a car', () => {
    expect(categoryScopeOf(null)).toBeNull()
  })
})
