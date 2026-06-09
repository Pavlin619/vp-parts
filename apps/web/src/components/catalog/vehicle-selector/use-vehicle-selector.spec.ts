import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ManufacturerDto, ModelSeriesDto, VehicleVariantDto } from '@vp-parts-shop/shared'
import { useVehicleSelector } from './use-vehicle-selector'

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../../../hooks/use-vehicle-context', () => ({
  useVehicleContext: jest.fn(),
}))

jest.mock('../../../lib/api/catalog', () => ({
  manufacturersQueryOptions: {
    queryKey: ['catalog', 'manufacturers'] as const,
    queryFn: jest.fn().mockResolvedValue([]),
  },
  modelSeriesQueryOptions: jest.fn((id: string) => ({
    queryKey: ['catalog', 'model-series', id] as const,
    queryFn: jest.fn().mockResolvedValue([]),
  })),
  variantsQueryOptions: jest.fn((id: string) => ({
    queryKey: ['catalog', 'variants', id] as const,
    queryFn: jest.fn().mockResolvedValue([]),
  })),
}))

import { useVehicleContext } from '../../../hooks/use-vehicle-context'

const mockUseVehicleContext = jest.mocked(useVehicleContext)

// ── Fixtures ───────────────────────────────────────────────────────────────

const BMW: ManufacturerDto = { id: 'bmw', name: 'BMW' }
const AUDI: ManufacturerDto = { id: 'audi', name: 'Audi' }
const SERIES_3: ModelSeriesDto = { id: 's3', manufacturerId: 'bmw', name: '3 Series' }
const VARIANT_320D: VehicleVariantDto = {
  vehicleId: 'v-320d',
  seriesId: 's3',
  name: 'BMW 320d (F30)',
  engine: '2.0d',
  powerKw: 110,
  yearFrom: 2012,
  yearTo: 2019,
  fuelType: 'Diesel',
  bodyType: 'Saloon',
}

const STORED_VEHICLE = {
  vehicleId: 'v-320d',
  manufacturerId: 'bmw',
  seriesId: 's3',
  manufacturerName: 'BMW',
  seriesName: '3 Series',
  variantName: 'BMW 320d (F30)',
  engine: '2.0d',
  powerKw: 110,
  yearFrom: 2012,
  yearTo: 2019,
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mockStore(selectedVehicle: typeof STORED_VEHICLE | null) {
  const setVehicle = jest.fn()
  mockUseVehicleContext.mockReturnValue({ setVehicle, selectedVehicle })
  return setVehicle
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

function buildQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useVehicleSelector — initial state (no stored vehicle)', () => {
  it('starts at step 0', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW, AUDI])
    mockStore(null)

    const { result } = renderHook(() => useVehicleSelector(jest.fn()), {
      wrapper: createWrapper(qc),
    })

    expect(result.current.step).toBe(0)
  })

  it('has null selections and null stepValues', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW])
    mockStore(null)

    const { result } = renderHook(() => useVehicleSelector(jest.fn()), {
      wrapper: createWrapper(qc),
    })

    expect(result.current.selectedMake).toBeNull()
    expect(result.current.selectedSeries).toBeNull()
    expect(result.current.pendingVariant).toBeNull()
    expect(result.current.stepValues).toEqual([null, null, null])
  })

  it('exposes manufacturers from the cache', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW, AUDI])
    mockStore(null)

    const { result } = renderHook(() => useVehicleSelector(jest.fn()), {
      wrapper: createWrapper(qc),
    })

    expect(result.current.filteredManufacturers).toEqual([BMW, AUDI])
  })
})

describe('useVehicleSelector — initial state (stored vehicle)', () => {
  it('starts at step 2 when a vehicle is stored', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW])
    qc.setQueryData(['catalog', 'model-series', 'bmw'], [SERIES_3])
    qc.setQueryData(['catalog', 'variants', 's3'], [VARIANT_320D])
    mockStore(STORED_VEHICLE)

    const { result } = renderHook(() => useVehicleSelector(jest.fn()), {
      wrapper: createWrapper(qc),
    })

    expect(result.current.step).toBe(2)
    expect(result.current.selectedMake).toEqual({ id: 'bmw', name: 'BMW' })
    expect(result.current.selectedSeries).toEqual({
      id: 's3',
      manufacturerId: 'bmw',
      name: '3 Series',
    })
  })

  it('pre-selects the stored variant as pendingVariant', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW])
    qc.setQueryData(['catalog', 'model-series', 'bmw'], [SERIES_3])
    qc.setQueryData(['catalog', 'variants', 's3'], [VARIANT_320D])
    mockStore(STORED_VEHICLE)

    const { result } = renderHook(() => useVehicleSelector(jest.fn()), {
      wrapper: createWrapper(qc),
    })

    expect(result.current.pendingVariant).toEqual(VARIANT_320D)
  })
})

describe('useVehicleSelector — step transitions', () => {
  it('handleSelectMake advances to step 1, sets make, clears series and search', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW, AUDI])
    mockStore(null)

    const { result } = renderHook(() => useVehicleSelector(jest.fn()), {
      wrapper: createWrapper(qc),
    })

    act(() => {
      result.current.setSearch('bm')
      result.current.handleSelectMake(BMW)
    })

    expect(result.current.step).toBe(1)
    expect(result.current.selectedMake).toEqual(BMW)
    expect(result.current.selectedSeries).toBeNull()
    expect(result.current.search).toBe('')
  })

  it('handleSelectSeries advances to step 2, sets series, clears variant and search', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW])
    qc.setQueryData(['catalog', 'model-series', 'bmw'], [SERIES_3])
    mockStore(null)

    const { result } = renderHook(() => useVehicleSelector(jest.fn()), {
      wrapper: createWrapper(qc),
    })

    act(() => result.current.handleSelectMake(BMW))
    act(() => {
      result.current.setSearch('3 se')
      result.current.handleSelectSeries(SERIES_3)
    })

    expect(result.current.step).toBe(2)
    expect(result.current.selectedSeries).toEqual(SERIES_3)
    expect(result.current.search).toBe('')
  })

  it('handleSelectVariant sets the pending variant', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW])
    qc.setQueryData(['catalog', 'model-series', 'bmw'], [SERIES_3])
    qc.setQueryData(['catalog', 'variants', 's3'], [VARIANT_320D])
    mockStore(null)

    const { result } = renderHook(() => useVehicleSelector(jest.fn()), {
      wrapper: createWrapper(qc),
    })

    act(() => result.current.handleSelectMake(BMW))
    act(() => result.current.handleSelectSeries(SERIES_3))
    act(() => result.current.handleSelectVariant(VARIANT_320D))

    expect(result.current.pendingVariant).toEqual(VARIANT_320D)
    expect(result.current.stepValues[2]).toBe(VARIANT_320D.engine)
  })

  it('handleStepClick navigates back to earlier steps', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW])
    qc.setQueryData(['catalog', 'model-series', 'bmw'], [SERIES_3])
    mockStore(null)

    const { result } = renderHook(() => useVehicleSelector(jest.fn()), {
      wrapper: createWrapper(qc),
    })

    act(() => result.current.handleSelectMake(BMW))
    act(() => result.current.handleSelectSeries(SERIES_3))
    act(() => result.current.handleStepClick(0))

    expect(result.current.step).toBe(0)
    expect(result.current.selectedSeries).toBeNull()
  })

  it('handleStepClick does not advance to a later step', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW])
    mockStore(null)

    const { result } = renderHook(() => useVehicleSelector(jest.fn()), {
      wrapper: createWrapper(qc),
    })

    act(() => result.current.handleStepClick(2))

    expect(result.current.step).toBe(0)
  })
})

describe('useVehicleSelector — confirm and close', () => {
  it('handleConfirm calls setVehicle with the correct shape then onClose', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW])
    qc.setQueryData(['catalog', 'model-series', 'bmw'], [SERIES_3])
    qc.setQueryData(['catalog', 'variants', 's3'], [VARIANT_320D])
    const setVehicle = mockStore(null)
    const onClose = jest.fn()

    const { result } = renderHook(() => useVehicleSelector(onClose), {
      wrapper: createWrapper(qc),
    })

    act(() => result.current.handleSelectMake(BMW))
    act(() => result.current.handleSelectSeries(SERIES_3))
    act(() => result.current.handleSelectVariant(VARIANT_320D))
    act(() => result.current.handleConfirm())

    expect(setVehicle).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: VARIANT_320D.vehicleId,
        manufacturerId: BMW.id,
        seriesId: SERIES_3.id,
        manufacturerName: BMW.name,
        seriesName: SERIES_3.name,
      }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('handleConfirm calls onConfirm instead of onClose when provided', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW])
    qc.setQueryData(['catalog', 'model-series', 'bmw'], [SERIES_3])
    qc.setQueryData(['catalog', 'variants', 's3'], [VARIANT_320D])
    mockStore(null)
    const onClose = jest.fn()
    const onConfirm = jest.fn()

    const { result } = renderHook(() => useVehicleSelector(onClose, onConfirm), {
      wrapper: createWrapper(qc),
    })

    act(() => result.current.handleSelectMake(BMW))
    act(() => result.current.handleSelectSeries(SERIES_3))
    act(() => result.current.handleSelectVariant(VARIANT_320D))
    act(() => result.current.handleConfirm())

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('handleConfirm is a no-op when no variant is pending', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW])
    const setVehicle = mockStore(null)
    const onClose = jest.fn()

    const { result } = renderHook(() => useVehicleSelector(onClose), {
      wrapper: createWrapper(qc),
    })

    act(() => result.current.handleConfirm())

    expect(setVehicle).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('handleClose delegates to onClose', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW])
    mockStore(null)
    const onClose = jest.fn()

    const { result } = renderHook(() => useVehicleSelector(onClose), {
      wrapper: createWrapper(qc),
    })

    act(() => result.current.handleClose())

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('useVehicleSelector — search filtering', () => {
  it('filters manufacturers by name (case-insensitive)', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW, AUDI])
    mockStore(null)

    const { result } = renderHook(() => useVehicleSelector(jest.fn()), {
      wrapper: createWrapper(qc),
    })

    act(() => result.current.setSearch('bm'))

    expect(result.current.filteredManufacturers).toEqual([BMW])
  })

  it('returns all manufacturers when search is empty', () => {
    const qc = buildQueryClient()
    qc.setQueryData(['catalog', 'manufacturers'], [BMW, AUDI])
    mockStore(null)

    const { result } = renderHook(() => useVehicleSelector(jest.fn()), {
      wrapper: createWrapper(qc),
    })

    expect(result.current.filteredManufacturers).toEqual([BMW, AUDI])
  })
})
