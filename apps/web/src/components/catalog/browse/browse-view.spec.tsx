import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SelectedVehicle } from '@/hooks/use-vehicle-context'
import { BrowseView } from './browse-view'

/** What the store holds; set per test, read by the mocked hook at call time. */
let storedVehicle: SelectedVehicle | null = null
let isStoreHydrated = true
const clearVehicleMock = jest.fn()

jest.mock('@/hooks/use-vehicle-context', () => {
  const store = (selector: (state: unknown) => unknown) =>
    selector({ selectedVehicle: storedVehicle, clearVehicle: clearVehicleMock })

  return {
    useVehicleContext: store,
  }
})

jest.mock('@/hooks/use-is-hydrated', () => ({
  useIsHydrated: () => isStoreHydrated,
}))

jest.mock('@/components/catalog/vehicle-selector', () => ({
  VehicleSelector: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="vehicle-selector" /> : null,
}))

// The categories fetch their own tree; that is browse-categories.spec's subject.
jest.mock('./categories', () => ({
  BrowseCategories: ({
    scope,
    scopedCategoryId,
  }: {
    scope: { vehicleId: string; vehicleName: string } | null
    scopedCategoryId?: string
  }) => (
    <div data-testid="browse-categories" data-scope={scopedCategoryId ?? ''}>
      {scope ? `${scope.vehicleId} ${scope.vehicleName}` : 'целият каталог'}
    </div>
  ),
}))

// The hero fetches its own photo and variant; neither is what this file covers.
jest.mock('./vehicle-hero', () => ({
  VehicleHero: ({ vehicle, onClear }: { vehicle: SelectedVehicle; onClear: () => void }) => (
    <div data-testid="vehicle-hero">
      {vehicle.seriesName}
      <button type="button" onClick={onClear}>
        Премахни
      </button>
    </div>
  ),
}))

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

beforeEach(() => {
  jest.clearAllMocks()
  storedVehicle = AUDI
  isStoreHydrated = true
})

/**
 * A car narrows the catalogue; it does not unlock it. Without one the page
 * reads the catalogue-wide tree and asks for a car alongside it, so a visitor
 * who removes their car — or has never picked one — still has a catalogue to
 * browse and a way back to the narrowed version of it.
 */
describe('BrowseView — before a car is picked', () => {
  beforeEach(() => {
    storedVehicle = null
  })

  it('shows the whole catalogue and asks for a car above it', () => {
    render(<BrowseView />)

    expect(screen.getByText('Изберете автомобил')).toBeInTheDocument()
    expect(screen.queryByTestId('vehicle-hero')).not.toBeInTheDocument()
    expect(screen.getByTestId('browse-categories')).toHaveTextContent(
      'целият каталог',
    )
  })

  it('narrows a category page to nothing but still renders it', () => {
    render(<BrowseView scopedCategoryId="100006" />)

    expect(screen.getByTestId('browse-categories')).toHaveAttribute(
      'data-scope',
      '100006',
    )
    expect(screen.getByText('Изберете автомобил')).toBeInTheDocument()
  })

  it('opens the selector from the prompt', async () => {
    render(<BrowseView />)

    await userEvent.click(screen.getByRole('button', { name: 'Избери автомобил' }))
    expect(screen.getByTestId('vehicle-selector')).toBeInTheDocument()
  })
})

describe('BrowseView — with a car', () => {
  it('shows the car under the title', () => {
    render(<BrowseView />)

    expect(screen.getByRole('heading', { name: 'Каталог' })).toBeInTheDocument()
    expect(screen.getByTestId('vehicle-hero')).toHaveTextContent('A3 (8L1)')
  })

  // The tree is answered per vehicle, so the categories are asked for that car
  // and no other, and its name is what their counts are labelled with.
  it('scopes the categories to it', () => {
    render(<BrowseView />)

    expect(screen.getByTestId('browse-categories')).toHaveTextContent(
      '13074 AUDI A3 (8L1)',
    )
  })

  // The narrowing is URL state read on the server; this screen only carries it
  // down to the categories, which are the only thing that can resolve it.
  it('hands the narrowing from the URL to the categories', () => {
    render(<BrowseView scopedCategoryId="100006" />)

    expect(screen.getByTestId('browse-categories')).toHaveAttribute(
      'data-scope',
      '100006',
    )
  })

  it('leaves the categories unnarrowed when the URL names none', () => {
    render(<BrowseView />)

    expect(screen.getByTestId('browse-categories')).toHaveAttribute(
      'data-scope',
      '',
    )
  })

  it('clears the car from the hero', async () => {
    render(<BrowseView />)

    await userEvent.click(screen.getByRole('button', { name: 'Премахни' }))
    expect(clearVehicleMock).toHaveBeenCalled()
  })
})

describe('BrowseView — before hydration', () => {
  beforeEach(() => {
    isStoreHydrated = false
  })

  // The store is read only on the client, so anything derived from it must be
  // held back until it has been — the title and trail are not.
  // Which tree to read is decided by the store, so the categories wait for it
  // too — starting the catalogue-wide read only to replace it with the car's
  // would pay for both and flash the wrong one.
  it('keeps the page shell and skeletons only what the store decides', () => {
    render(<BrowseView />)

    expect(screen.getByRole('heading', { name: 'Каталог' })).toBeInTheDocument()
    expect(screen.getByLabelText('Зареждане на автомобила')).toBeInTheDocument()
    expect(screen.queryByTestId('vehicle-hero')).not.toBeInTheDocument()
    expect(screen.queryByText('Изберете автомобил')).not.toBeInTheDocument()
    expect(screen.queryByTestId('browse-categories')).not.toBeInTheDocument()
  })
})
