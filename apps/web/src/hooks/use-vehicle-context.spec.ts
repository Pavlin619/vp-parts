import { renderHook } from '@testing-library/react'
import { useVehicleContext, useHydration, type SelectedVehicle } from './use-vehicle-context'

const mockVehicle: SelectedVehicle = {
  vehicleId: 'v-001',
  manufacturerId: 'mfr-5',
  seriesId: 'ser-10',
  manufacturerName: 'BMW',
  seriesName: '3 Series',
  variantName: 'BMW 320d (F30)',
  engineCodes: ['N47D20C'],
  powerKw: 135,
  powerHp: 184,
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
      engineCodes: ['N47D20C'],
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

/**
 * A car already in a visitor's browser is migrated rather than re-picked, so
 * every shape a previous release wrote has to survive the read.
 */
describe('migrating a stored vehicle', () => {
  const migrate = useVehicleContext.persist.getOptions().migrate!

  function migrateStored(stored: unknown) {
    return migrate(stored, 1) as {
      selectedVehicle: SelectedVehicle | null
      recentVehicles: SelectedVehicle[]
    }
  }

  function savedWithoutPower() {
    const vehicle: Partial<SelectedVehicle> = { ...mockVehicle }
    delete vehicle.powerHp

    return vehicle
  }

  it('keeps a car saved before horsepower, with the figure unknown', () => {
    const stored = savedWithoutPower()

    const state = migrateStored({
      selectedVehicle: stored,
      recentVehicles: [stored],
    })

    expect(state.selectedVehicle).toMatchObject({ vehicleId: 'v-001', powerHp: null })
    expect(state.recentVehicles[0].powerHp).toBeNull()
  })

  it('leaves a horsepower figure that was already stored', () => {
    const state = migrateStored({ selectedVehicle: mockVehicle, recentVehicles: [] })

    expect(state.selectedVehicle?.powerHp).toBe(184)
  })

  // A car saved before a variant was known to have several engines holds the
  // first code as a bare string. It is still a true code, so it is promoted
  // rather than thrown away — the next pass through the selector fills in the
  // rest.
  it('promotes a single stored engine code to the list', () => {
    const savedWithOneCode = { ...mockVehicle, engine: 'N47D20C' }
    delete (savedWithOneCode as Partial<SelectedVehicle>).engineCodes

    const state = migrateStored({
      selectedVehicle: savedWithOneCode,
      recentVehicles: [savedWithOneCode],
    })

    expect(state.selectedVehicle?.engineCodes).toEqual(['N47D20C'])
    expect(state.recentVehicles[0].engineCodes).toEqual(['N47D20C'])
  })

  it('keeps a car saved with no engine code at all', () => {
    const savedWithoutCode: Partial<SelectedVehicle> = { ...mockVehicle }
    delete savedWithoutCode.engineCodes

    const state = migrateStored({
      selectedVehicle: savedWithoutCode,
      recentVehicles: [],
    })

    expect(state.selectedVehicle?.engineCodes).toEqual([])
  })

  it('leaves a list of codes that was already stored', () => {
    const state = migrateStored({
      selectedVehicle: { ...mockVehicle, engineCodes: ['OM 642.852', 'OM 642.850'] },
      recentVehicles: [],
    })

    expect(state.selectedVehicle?.engineCodes).toEqual(['OM 642.852', 'OM 642.850'])
  })

  // The ids are what reopen the selector on the saved car; without them there is
  // nothing to restore, so the car goes rather than the dialog breaking.
  it('forgets a car saved without the ids the selector needs', () => {
    const state = migrateStored({
      selectedVehicle: { ...mockVehicle, seriesId: '' },
      recentVehicles: [mockVehicle],
    })

    expect(state.selectedVehicle).toBeNull()
    expect(state.recentVehicles).toEqual([])
  })
})

describe('useHydration', () => {
  it('returns true after the component has mounted (effects have fired)', () => {
    const { result } = renderHook(() => useHydration())
    expect(result.current).toBe(true)
  })
})
