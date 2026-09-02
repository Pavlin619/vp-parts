import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SelectedVehicle } from '@/hooks/use-vehicle-context'
import { parseSearchUrl } from '@/lib/catalog/search-url'
import { SearchVehicleFilter } from './search-vehicle-filter'

const pushMock = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

/** What the store holds; set per test, read by the mocked hook at call time. */
let storedVehicle: SelectedVehicle | null = null
let isStoreHydrated = true

jest.mock('@/hooks/use-vehicle-context', () => {
  const store = (selector: (state: unknown) => unknown) =>
    selector({ selectedVehicle: storedVehicle })
  store.getState = () => ({ selectedVehicle: storedVehicle })

  return {
    useHydration: () => isStoreHydrated,
    useVehicleContext: store,
  }
})

jest.mock('@/components/catalog/vehicle-selector', () => ({
  VehicleSelector: ({
    isOpen,
    onConfirm,
  }: {
    isOpen: boolean
    onConfirm?: () => void
  }) =>
    isOpen ? (
      <button type="button" onClick={onConfirm}>
        Потвърди автомобил
      </button>
    ) : null,
}))

const AUDI: SelectedVehicle = {
  vehicleId: '10042',
  manufacturerId: '5',
  seriesId: '110',
  manufacturerName: 'AUDI',
  seriesName: 'A3',
  variantName: 'A3 1.6 TDI',
  engine: '1.6 TDI',
  powerKw: 77,
  yearFrom: 2012,
  yearTo: 2020,
}

function renderCard(params: { vehicleId?: string; total?: number } = {}) {
  return render(
    <SearchVehicleFilter
      state={parseSearchUrl({
        q: 'въздушен филтър',
        ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
      })}
      total={params.total ?? 14}
    />,
  )
}

function hrefOf(name: string | RegExp): string {
  return screen.getByRole('link', { name }).getAttribute('href') ?? ''
}

beforeEach(() => {
  pushMock.mockReset()
  storedVehicle = null
  isStoreHydrated = true
})

describe('SearchVehicleFilter — no vehicle saved', () => {
  it('says the results span every vehicle', () => {
    renderCard()

    expect(screen.getByText(/за всички автомобили/)).toBeVisible()
  })

  it('offers to pick one', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: /Избери автомобил/ }))

    expect(
      screen.getByRole('button', { name: 'Потвърди автомобил' }),
    ).toBeInTheDocument()
  })

  // Picking a vehicle from inside a card that says what it will do is the ask
  // itself, so it applies rather than waiting for a second confirmation.
  it('scopes the search to the vehicle that was picked', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: /Избери автомобил/ }))
    storedVehicle = AUDI
    await user.click(screen.getByRole('button', { name: 'Потвърди автомобил' }))

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('vehicleId=10042'),
    )
  })

  it('navigates nowhere when the selector closed without a vehicle', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: /Избери автомобил/ }))
    await user.click(screen.getByRole('button', { name: 'Потвърди автомобил' }))

    expect(pushMock).not.toHaveBeenCalled()
  })
})

describe('SearchVehicleFilter — a vehicle saved but not applied', () => {
  beforeEach(() => {
    storedVehicle = AUDI
  })

  it('names the saved vehicle', () => {
    renderCard()

    expect(screen.getByText('AUDI A3')).toBeVisible()
  })

  // Two variants of one model differ by trim, power and build years, and the
  // wrong one means the wrong parts.
  it('spells out the trim, the power and the years', () => {
    renderCard()

    expect(screen.getByText('A3 1.6 TDI · 77 kW · 2012–2020')).toBeVisible()
  })

  it('leaves the years open-ended for a model still built', () => {
    storedVehicle = { ...AUDI, yearTo: null }
    renderCard()

    expect(screen.getByText(/2012\+$/)).toBeVisible()
  })

  // TecDoc files an engine *code* here — `AGR`, `OM 699.302` — which identifies
  // nothing to a visitor reading the card.
  it('leaves the engine code out', () => {
    storedVehicle = { ...AUDI, engine: 'OM 699.302' }
    renderCard()

    expect(screen.queryByText(/OM 699.302/)).not.toBeInTheDocument()
  })

  it('offers the same search narrowed to it', () => {
    renderCard()

    expect(hrefOf(/Само за този автомобил/)).toContain('vehicleId=10042')
  })

  // The point of the change: the vehicle is on offer, not applied. Saying what
  // the list currently holds is what makes that visible.
  it('says the results are not narrowed yet', () => {
    renderCard({ total: 14 })

    expect(screen.getByText(/всички 14 резултата/)).toBeVisible()
  })

  it('offers a different vehicle through the selector', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: /Друг автомобил/ }))

    expect(
      screen.getByRole('button', { name: 'Потвърди автомобил' }),
    ).toBeInTheDocument()
  })
})

describe('SearchVehicleFilter — the search is scoped', () => {
  beforeEach(() => {
    storedVehicle = AUDI
  })

  it('says the results are limited to the vehicle', () => {
    renderCard({ vehicleId: '10042' })

    expect(screen.getByText(/само части, съвместими/)).toBeVisible()
    expect(screen.getByText('AUDI A3')).toBeVisible()
  })

  it('offers the way back to every part', () => {
    renderCard({ vehicleId: '10042' })

    expect(hrefOf(/Всички части/)).not.toContain('vehicleId')
  })

  it('does not offer a narrowing that is already applied', () => {
    renderCard({ vehicleId: '10042' })

    expect(
      screen.queryByRole('link', { name: /Само за този автомобил/ }),
    ).not.toBeInTheDocument()
  })

  /**
   * A shared or bookmarked link carries an id this browser has never resolved.
   * The scope is still real and still has to be reversible, so the card renders
   * without a name rather than not at all.
   */
  it('stands without a name when the store cannot identify the id', () => {
    storedVehicle = { ...AUDI, vehicleId: '999' }
    renderCard({ vehicleId: '10042' })

    expect(screen.queryByText('AUDI A3')).not.toBeInTheDocument()
    expect(hrefOf(/Всички части/)).not.toContain('vehicleId')
  })
})

// The card branches on persisted state, so a first client render that differs
// from the server HTML would be a hydration mismatch.
describe('SearchVehicleFilter — before hydration', () => {
  it('commits to nothing the store has not answered yet', () => {
    isStoreHydrated = false
    storedVehicle = AUDI
    renderCard()

    expect(screen.queryByText('AUDI A3')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Избери автомобил/ }),
    ).not.toBeInTheDocument()
  })
})
