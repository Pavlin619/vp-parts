import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { VehicleVariantDto } from '@vp-parts-shop/shared'
import type { SelectedVehicle } from '@/hooks/use-vehicle-context'
import { parseSearchUrl } from '@/lib/catalog/search-url'
import { SearchVehicleFilter } from './search-vehicle-filter'

const pushMock = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

/** The variant list the card reads the series photo out of. */
const variantsMock = jest.fn<Promise<VehicleVariantDto[]>, [string]>()

jest.mock('@/lib/api/catalog', () => ({
  variantsQueryOptions: (seriesId: string) => ({
    queryKey: ['catalog', 'variants', seriesId],
    queryFn: () => variantsMock(seriesId),
  }),
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
  engineCodes: ['1.6 TDI'],
  powerKw: 77,
  powerHp: 105,
  yearFrom: 2012,
  yearTo: 2020,
}

const A3_PHOTO = 'https://tecdoc.test/a3.jpg'

function variant(imageUrl: string | null): VehicleVariantDto {
  return {
    vehicleId: '10042',
    seriesId: '110',
    name: 'A3 1.6 TDI',
    engineCodes: ['1.6 TDI'],
    powerKw: 77,
    powerHp: 105,
    displacementLiters: 1.6,
    yearFrom: 2012,
    yearTo: 2020,
    fuelType: 'Diesel',
    bodyType: 'Saloon',
    imageUrl,
    kbaNumbers: [],
  }
}

function renderCard(params: { vehicleId?: string; total?: number } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <SearchVehicleFilter
          state={parseSearchUrl({
            q: 'въздушен филтър',
            ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
          })}
          total={params.total ?? 14}
        />
      </QueryClientProvider>,
    ),
  }
}

/** Lets a test assert what the card did *not* draw once the photo read is in. */
function settled(queryClient: QueryClient) {
  return waitFor(() => expect(queryClient.isFetching()).toBe(0))
}

function hrefOf(name: string | RegExp): string {
  return screen.getByRole('link', { name }).getAttribute('href') ?? ''
}

/**
 * Every image the card draws — the make's badge, and the series photo. The
 * badge is bundled and jsdom resolves its path against the test origin; the
 * photo's URL is TecDoc's and already absolute.
 */
function imageSources(container: HTMLElement): string[] {
  return [...container.querySelectorAll('img')].map((image) =>
    (image.getAttribute('src') ?? '').replace('http://localhost', ''),
  )
}

beforeEach(() => {
  pushMock.mockReset()
  variantsMock.mockReset()
  variantsMock.mockResolvedValue([variant(null)])
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

    expect(
      screen.getByText('A3 1.6 TDI · 77 kW (105 к.с.) · 2012–2020'),
    ).toBeVisible()
  })

  // Kilowatts are what the registration document carries; horsepower is what a
  // Bulgarian buyer knows the engine by.
  it('drops to kilowatts alone for a car saved before horsepower was stored', () => {
    storedVehicle = { ...AUDI, powerHp: null }
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
    storedVehicle = { ...AUDI, engineCodes: ['OM 699.302'] }
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

/**
 * The card is the only thing on the page saying which car the results are
 * about, so it shows the car rather than a generic glyph standing for one.
 */
describe('SearchVehicleFilter — picturing the vehicle', () => {
  beforeEach(() => {
    storedVehicle = AUDI
  })

  it('badges the make of the saved vehicle', () => {
    const { container } = renderCard()

    expect(imageSources(container)).toContain('/vehicle-makes/audi.webp')
  })

  it('shows the photo of the series once it arrives', async () => {
    variantsMock.mockResolvedValue([variant(null), variant(A3_PHOTO)])
    const { container } = renderCard()

    await waitFor(() => expect(imageSources(container)).toContain(A3_PHOTO))
    expect(variantsMock).toHaveBeenCalledWith('110')
  })

  // Between a fifth and nearly half of series file no photo, so the card has to
  // stand without one rather than reserve a box for it.
  it('stands on the badge alone for a series that files none', async () => {
    const { container, queryClient } = renderCard()

    await settled(queryClient)

    expect(imageSources(container)).toEqual(['/vehicle-makes/audi.webp'])
  })

  // The URL is a signed token with a short life, so it can be dead by the time
  // the browser asks for it.
  it('drops a photo whose URL no longer loads', async () => {
    variantsMock.mockResolvedValue([variant(A3_PHOTO)])
    const { container } = renderCard()

    await waitFor(() => expect(imageSources(container)).toContain(A3_PHOTO))
    fireEvent.error(container.querySelector(`img[src="${A3_PHOTO}"]`)!)

    expect(imageSources(container)).not.toContain(A3_PHOTO)
  })

  it('reads no variants when there is no vehicle to picture', async () => {
    storedVehicle = null
    const { queryClient } = renderCard()

    await settled(queryClient)

    expect(variantsMock).not.toHaveBeenCalled()
  })

  // A scope arrived at through someone else's link names a vehicle this browser
  // never resolved: there is no series to read a photo from.
  it('reads no variants for a scope the store cannot identify', async () => {
    storedVehicle = { ...AUDI, vehicleId: '999' }
    const { queryClient } = renderCard({ vehicleId: '10042' })

    await settled(queryClient)

    expect(variantsMock).not.toHaveBeenCalled()
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
