import { renderHook } from '@testing-library/react'
import { useVehicleContext, useHydration, type SelectedVehicle } from './use-vehicle-context'

const mockVehicle: SelectedVehicle = {
  vehicleId: 'v-001',
  manufacturerId: 'mfr-5',
  seriesId: 'ser-10',
  manufacturerName: 'BMW',
  seriesName: '3 Series',
  variantName: 'BMW 320d (F30)',
  engine: 'N47D20C',
  powerKw: 135,
  yearFrom: 2018,
  yearTo: 2022,
}

beforeEach(() => {
  useVehicleContext.setState({ selectedVehicle: null, recentVehicles: [] })
})

describe('useVehicleContext', () => {
  it('initialises with no selected vehicle', () => {
    expect(useVehicleContext.getState().selectedVehicle).toBeNull()
  })

  it('initialises with empty recent vehicles', () => {
    expect(useVehicleContext.getState().recentVehicles).toEqual([])
  })

  it('setVehicle stores the vehicle in state', () => {
    useVehicleContext.getState().setVehicle(mockVehicle)
    expect(useVehicleContext.getState().selectedVehicle).toEqual(mockVehicle)
  })

  it('setVehicle adds the vehicle to recentVehicles', () => {
    useVehicleContext.getState().setVehicle(mockVehicle)
    expect(useVehicleContext.getState().recentVehicles).toHaveLength(1)
    expect(useVehicleContext.getState().recentVehicles[0]).toEqual(mockVehicle)
  })

  it('setVehicle prepends to recentVehicles and deduplicates by vehicleId', () => {
    const second: SelectedVehicle = { ...mockVehicle, vehicleId: 'v-002', manufacturerName: 'Audi' }
    useVehicleContext.getState().setVehicle(mockVehicle)
    useVehicleContext.getState().setVehicle(second)
    useVehicleContext.getState().setVehicle(mockVehicle)

    const recents = useVehicleContext.getState().recentVehicles
    expect(recents).toHaveLength(2)
    expect(recents[0].vehicleId).toBe('v-001')
    expect(recents[1].vehicleId).toBe('v-002')
  })

  it('recentVehicles is capped at 3 entries', () => {
    const vehicles = Array.from({ length: 5 }, (_, i) => ({
      ...mockVehicle,
      vehicleId: `v-${i}`,
    }))
    for (const v of vehicles) {
      useVehicleContext.getState().setVehicle(v)
    }
    expect(useVehicleContext.getState().recentVehicles).toHaveLength(3)
  })

  it('clearVehicle resets the selected vehicle to null', () => {
    useVehicleContext.getState().setVehicle(mockVehicle)
    useVehicleContext.getState().clearVehicle()
    expect(useVehicleContext.getState().selectedVehicle).toBeNull()
  })

  it('clearVehicle does not clear recentVehicles', () => {
    useVehicleContext.getState().setVehicle(mockVehicle)
    useVehicleContext.getState().clearVehicle()
    expect(useVehicleContext.getState().recentVehicles).toHaveLength(1)
  })

  it('setVehicle replaces a previously set vehicle', () => {
    const first: SelectedVehicle = { ...mockVehicle, vehicleId: 'v-001' }
    const second: SelectedVehicle = { ...mockVehicle, vehicleId: 'v-002', manufacturerName: 'Mercedes' }

    useVehicleContext.getState().setVehicle(first)
    useVehicleContext.getState().setVehicle(second)

    const { selectedVehicle } = useVehicleContext.getState()
    expect(selectedVehicle?.vehicleId).toBe('v-002')
    expect(selectedVehicle?.manufacturerName).toBe('Mercedes')
  })

  it('preserves all vehicle fields after setVehicle', () => {
    useVehicleContext.getState().setVehicle(mockVehicle)
    expect(useVehicleContext.getState().selectedVehicle).toMatchObject({
      yearFrom: 2018,
      yearTo: 2022,
      engine: 'N47D20C',
      powerKw: 135,
      manufacturerId: 'mfr-5',
      seriesId: 'ser-10',
    })
  })

  it('accepts yearTo as null', () => {
    useVehicleContext.getState().setVehicle({ ...mockVehicle, yearTo: null })
    expect(useVehicleContext.getState().selectedVehicle?.yearTo).toBeNull()
  })
})

describe('useHydration', () => {
  it('returns true after the component has mounted (effects have fired)', () => {
    const { result } = renderHook(() => useHydration())
    expect(result.current).toBe(true)
  })
})
