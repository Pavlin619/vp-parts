import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { VehicleVariantDto } from '@vp-parts-shop/shared'
import type { SelectedVehicle } from '@/hooks/use-vehicle-context'
import { useSelectedVariant } from './use-selected-variant'

const variantsMock = jest.fn<Promise<VehicleVariantDto[]>, [string]>()

jest.mock('@/lib/api/catalog', () => ({
  variantsQueryOptions: (seriesId: string) => ({
    queryKey: ['catalog', 'variants', seriesId],
    queryFn: () => variantsMock(seriesId),
  }),
}))

const VEHICLE: SelectedVehicle = {
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

function variant(vehicleId: string): VehicleVariantDto {
  return {
    vehicleId,
    seriesId: '2439',
    name: `variant-${vehicleId}`,
    yearFrom: 1996,
    yearTo: 2003,
    engineCodes: [],
    powerKw: 110,
    powerHp: 150,
    displacementLiters: 1.8,
    fuelType: 'Бензин',
    bodyType: 'Хечбек',
    kbaNumbers: [],
    imageUrl: null,
  }
}

function renderSelectedVariant(vehicle: SelectedVehicle | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return renderHook(() => useSelectedVariant(vehicle), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useSelectedVariant', () => {
  it('picks the saved vehicle out of its series list', async () => {
    variantsMock.mockResolvedValue([variant('99'), variant('13074')])
    const { result } = renderSelectedVariant(VEHICLE)

    await waitFor(() => expect(result.current?.vehicleId).toBe('13074'))
    expect(variantsMock).toHaveBeenCalledWith('2439')
  })

  // Null rather than a half-filled record, so a caller renders what the store
  // already knows instead of a row of dashes.
  it('is null until the list arrives', () => {
    variantsMock.mockReturnValue(new Promise(() => {}))
    const { result } = renderSelectedVariant(VEHICLE)
    expect(result.current).toBeNull()
  })

  it('is null when the series does not carry the vehicle', async () => {
    variantsMock.mockResolvedValue([variant('99')])
    const { result } = renderSelectedVariant(VEHICLE)

    await waitFor(() => expect(variantsMock).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('asks for nothing when no car is saved', () => {
    const { result } = renderSelectedVariant(null)
    expect(result.current).toBeNull()
    expect(variantsMock).not.toHaveBeenCalled()
  })
})
