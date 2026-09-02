import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StockScopeCountsDto } from '@vp-parts-shop/shared'
import { parseSearchUrl } from '@/lib/catalog/search-url'
import { SearchResultsHeader } from './search-results-header'

const pushMock = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

/** What the store holds when the selector calls back; set per test. */
let storedVehicle: { vehicleId: string } | null = null

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

jest.mock('@/hooks/use-vehicle-context', () => ({
  useHydration: () => true,
  useVehicleContext: { getState: () => ({ selectedVehicle: storedVehicle }) },
}))

const COUNTS: StockScopeCountsDto = { all: 14, central: 12, external: 6 }

/**
 * A match set too wide to enumerate. `isRankable` is what says so — the
 * catalogue ordering alongside it is a consequence, and on its own would also
 * describe a narrow set whose visitor simply chose that order.
 */
const WIDE_SET = {
  total: 4812,
  ordering: 'catalogue',
  isRankable: false,
} as const

function renderHeader(
  props: Partial<Parameters<typeof SearchResultsHeader>[0]> = {},
) {
  return render(
    <SearchResultsHeader
      state={parseSearchUrl({ q: 'WL634' })}
      total={14}
      ordering="availability"
      isRankable
      {...props}
    />,
  )
}

describe('SearchResultsHeader — which left-hand control it shows', () => {
  beforeEach(() => {
    pushMock.mockReset()
    storedVehicle = null
  })

  it('shows the stock filter when the API counted the origins', () => {
    renderHeader({ stockScopeCounts: COUNTS })

    expect(screen.getByRole('navigation', { name: 'Наличност' })).toBeVisible()
  })

  // Offering the control without counts would promise a narrowing the API has
  // already said it cannot honour.
  it('falls back to a plain count when it has no origin counts', () => {
    renderHeader(WIDE_SET)

    expect(
      screen.queryByRole('navigation', { name: 'Наличност' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/артикула/)).toHaveTextContent('4 812 артикула')
  })

  it('groups the thousands in that count', () => {
    renderHeader(WIDE_SET)

    expect(screen.getByText(/артикула/).textContent).not.toContain('4812')
  })

  it('places the pager it was given', () => {
    renderHeader({ pager: <span>1/602</span> })

    expect(screen.getByText('1/602')).toBeInTheDocument()
  })

  it('always offers the VAT toggle, whichever tier the set is in', () => {
    const { rerender } = renderHeader({ stockScopeCounts: COUNTS })
    expect(screen.getByRole('switch', { name: 'Цени с ДДС' })).toBeVisible()

    rerender(
      <SearchResultsHeader
        state={parseSearchUrl({ q: 'WL634' })}
        {...WIDE_SET}
      />,
    )
    expect(screen.getByRole('switch', { name: 'Цени с ДДС' })).toBeVisible()
  })

  /**
   * The reason the tier is reported on its own rather than inferred from the
   * ordering. A visitor may pick the catalogue order over fifty results, and
   * that must cost them neither the stock filter nor a prompt to narrow a set
   * that is already narrow.
   */
  it('keeps the stock filter when a narrow set is shown in catalogue order', () => {
    renderHeader({ ordering: 'catalogue', stockScopeCounts: COUNTS })

    expect(screen.getByRole('navigation', { name: 'Наличност' })).toBeVisible()
    expect(screen.queryByText(/по-конкретен резултат/)).not.toBeInTheDocument()
  })
})

describe('SearchResultsHeader — the wide-set notice', () => {
  beforeEach(() => {
    pushMock.mockReset()
    storedVehicle = null
  })

  it('explains an unranked list and how to narrow it', () => {
    renderHeader(WIDE_SET)

    expect(screen.getByText(/по-конкретен резултат/)).toBeInTheDocument()
  })

  // A ranked list already leads with what we can ship, so there is nothing to
  // apologise for and nothing the visitor has to do.
  it('stays away from a list that is already ranked', () => {
    renderHeader({ stockScopeCounts: COUNTS })

    expect(screen.queryByText(/по-конкретен резултат/)).not.toBeInTheDocument()
  })

  // Hiding it outright would leave the visitor holding an unranked list with
  // nothing on screen saying so.
  it('collapses to a badge rather than disappearing', async () => {
    const user = userEvent.setup()
    renderHeader(WIDE_SET)

    await user.click(screen.getByRole('button', { name: 'Скрий' }))

    expect(screen.queryByText(/по-конкретен резултат/)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Без филтри по наличност/ }),
    ).toBeInTheDocument()
  })

  it('expands again from that badge', async () => {
    const user = userEvent.setup()
    renderHeader(WIDE_SET)

    await user.click(screen.getByRole('button', { name: 'Скрий' }))
    await user.click(
      screen.getByRole('button', { name: /Без филтри по наличност/ }),
    )

    expect(screen.getByText(/по-конкретен резултат/)).toBeInTheDocument()
  })
})

describe('SearchResultsHeader — scoping to a vehicle', () => {
  beforeEach(() => {
    pushMock.mockReset()
    storedVehicle = null
  })

  it('opens the vehicle selector from the notice', async () => {
    const user = userEvent.setup()
    renderHeader(WIDE_SET)

    await user.click(screen.getByRole('button', { name: /Избери автомобил/ }))

    expect(
      screen.getByRole('button', { name: 'Потвърди автомобил' }),
    ).toBeInTheDocument()
  })

  it('re-runs the search scoped to the confirmed vehicle', async () => {
    const user = userEvent.setup()
    storedVehicle = { vehicleId: '10042' }
    renderHeader(WIDE_SET)

    await user.click(screen.getByRole('button', { name: /Избери автомобил/ }))
    await user.click(screen.getByRole('button', { name: 'Потвърди автомобил' }))

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('vehicleId=10042'),
    )
  })

  // The vehicle is written to the store and the callback fires in the same
  // tick, so reading it at render time would send the previous one.
  it('reads the vehicle at confirm time, not at render time', async () => {
    const user = userEvent.setup()
    renderHeader(WIDE_SET)

    await user.click(screen.getByRole('button', { name: /Избери автомобил/ }))
    storedVehicle = { vehicleId: '99' }
    await user.click(screen.getByRole('button', { name: 'Потвърди автомобил' }))

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('vehicleId=99'),
    )
  })

  it('navigates nowhere when the selector closed without a vehicle', async () => {
    const user = userEvent.setup()
    renderHeader(WIDE_SET)

    await user.click(screen.getByRole('button', { name: /Избери автомобил/ }))
    await user.click(screen.getByRole('button', { name: 'Потвърди автомобил' }))

    expect(pushMock).not.toHaveBeenCalled()
  })
})
