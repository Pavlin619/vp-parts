import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SelectedVehicle } from '../../hooks/use-vehicle-context'
import { VehicleFinderCard } from './vehicle-finder-card'

interface VehicleContextState {
  selectedVehicle: SelectedVehicle | null;
  recentVehicles: SelectedVehicle[];
  setVehicle: jest.Mock;
  clearVehicle: jest.Mock;
}

jest.mock('../../hooks/use-vehicle-context', () => ({
  useHydration: jest.fn(),
  useVehicleContext: jest.fn(),
}))

jest.mock('../catalog/vehicle-selector', () => ({
  VehicleSelector: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="vehicle-selector-modal" /> : null,
}))

jest.mock('./vehicle-finder-manual', () => ({
  VehicleFinderManual: ({ onOpenSelector }: { onOpenSelector: () => void }) => (
    <button onClick={onOpenSelector} data-testid="open-selector-trigger">
      Стъпки
    </button>
  ),
}))

jest.mock('./recent-vehicles-list', () => ({
  RecentVehiclesList: () => null,
}))

import { useHydration, useVehicleContext } from '../../hooks/use-vehicle-context'

const mockedUseHydration = jest.mocked(useHydration)
const mockedUseVehicleContext = jest.mocked(useVehicleContext)

const VEHICLE: SelectedVehicle = {
  vehicleId: 'v-1',
  manufacturerId: 'mfr-16',
  seriesId: 'ser-1234',
  manufacturerName: 'AUDI',
  seriesName: '80 B4 Avant (8C5)',
  variantName: '2.0 E',
  engineCodes: ['ABT'],
  powerKw: 66,
  powerHp: 90,
  yearFrom: 1992,
  yearTo: 1996,
}

function renderCard(
  selectedVehicle: SelectedVehicle | null,
  { isHydrated = true }: { isHydrated?: boolean } = {},
) {
  mockedUseHydration.mockReturnValue(isHydrated)
  mockedUseVehicleContext.mockImplementation((selector: (s: VehicleContextState) => unknown) =>
    selector({
      selectedVehicle,
      recentVehicles: [],
      setVehicle: jest.fn(),
      clearVehicle: jest.fn(),
    }),
  )

  render(<VehicleFinderCard />)
}

// VIN and plate lookup need a licence we do not hold, so the tabs offered two
// modes that could never answer.
describe('VehicleFinderCard — no mode tabs', () => {
  it('offers the three steps and no mode to switch away from them', () => {
    renderCard(null)

    expect(screen.queryByRole('button', { name: 'Ръчно' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'VIN' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Рег. №' })).not.toBeInTheDocument()
    expect(screen.getByTestId('open-selector-trigger')).toBeInTheDocument()
  })
})

describe('VehicleFinderCard — call to action', () => {
  it('asks for a vehicle while none is picked', () => {
    renderCard(null)

    expect(screen.getByRole('button', { name: /избери автомобил/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /към каталога/i })).not.toBeInTheDocument()
  })

  // The catalogue is reachable either way from the nav; what this button is for
  // is the step the visitor has not done, so it opens the dialog rather than
  // sitting disabled next to three fields.
  it('opens the selector from the call to action', async () => {
    renderCard(null)

    await userEvent.click(screen.getByRole('button', { name: /избери автомобил/i }))

    expect(screen.getByTestId('vehicle-selector-modal')).toBeInTheDocument()
  })

  it('sends a visitor with a vehicle to the catalogue', () => {
    renderCard(VEHICLE)

    expect(screen.getByRole('link', { name: /към каталога/i })).toHaveAttribute(
      'href',
      '/catalog',
    )
    expect(screen.queryByRole('button', { name: /избери автомобил/i })).not.toBeInTheDocument()
  })

  // The vehicle is read from `localStorage`, so the server has no way to know
  // there is one. Asking is the honest first paint, and it is also the one that
  // matches the server HTML.
  it('asks for a vehicle before hydration, even when one is stored', () => {
    renderCard(VEHICLE, { isHydrated: false })

    expect(screen.getByRole('button', { name: /избери автомобил/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /към каталога/i })).not.toBeInTheDocument()
  })
})

describe('VehicleFinderCard — vehicle selector modal', () => {
  it('is closed until something opens it', () => {
    renderCard(null)

    expect(screen.queryByTestId('vehicle-selector-modal')).not.toBeInTheDocument()
  })

  it('opens from a step field', async () => {
    renderCard(null)

    await userEvent.click(screen.getByTestId('open-selector-trigger'))

    expect(screen.getByTestId('vehicle-selector-modal')).toBeInTheDocument()
  })
})
