import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AutocompleteItemDto } from '@vp-parts-shop/shared'
import { SearchBar } from './search-bar'

// ── Mocks ──────────────────────────────────────────────────────────────────

const pushMock = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const getAutocompleteMock = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  autocompleteQueryOptions: (query: string) => ({
    queryKey: ['catalog', 'autocomplete', query] as const,
    queryFn: () => getAutocompleteMock(query) as Promise<AutocompleteItemDto[]>,
  }),
}))

jest.mock('@/hooks/use-vehicle-context', () => ({
  useVehicleContext: jest.fn(),
}))

import { useVehicleContext } from '@/hooks/use-vehicle-context'

const mockUseVehicleContext = jest.mocked(useVehicleContext)

// ── Helpers ────────────────────────────────────────────────────────────────

const SUGGESTIONS: AutocompleteItemDto[] = [
  { articleNumber: 'WL6340', brandName: 'WIX', description: 'Oil Filter' },
  {
    articleNumber: 'WL6341',
    brandName: 'WIX',
    description: 'Oil Filter Heavy Duty',
  },
]

function setVehicleContext(vehicleId: string | null) {
  const state = {
    selectedVehicle: vehicleId ? { vehicleId } : null,
  }
  mockUseVehicleContext.mockImplementation((selector) =>
    selector(state as never),
  )
}

function renderSearchBar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SearchBar debounceMs={0} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  setVehicleContext(null)
  getAutocompleteMock.mockResolvedValue(SUGGESTIONS)
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SearchBar', () => {
  it('renders a combobox search input', () => {
    renderSearchBar()

    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('does not fetch suggestions for input under 3 characters', async () => {
    const user = userEvent.setup()
    renderSearchBar()

    await user.type(screen.getByRole('combobox'), 'WL')

    await waitFor(() => {
      expect(getAutocompleteMock).not.toHaveBeenCalled()
    })
  })

  it('shows autocomplete suggestions for input of 3+ characters', async () => {
    const user = userEvent.setup()
    renderSearchBar()

    await user.type(screen.getByRole('combobox'), 'WL6')

    expect(await screen.findByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.getByText('WL6340')).toBeInTheDocument()
  })

  it('renders at most 8 suggestions', async () => {
    getAutocompleteMock.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        articleNumber: `WL63${i}`,
        brandName: 'WIX',
        description: 'Oil Filter',
      })),
    )
    const user = userEvent.setup()
    renderSearchBar()

    await user.type(screen.getByRole('combobox'), 'WL6')

    await screen.findByRole('listbox')
    expect(screen.getAllByRole('option')).toHaveLength(8)
  })

  it('navigates to the article detail page when a suggestion is clicked', async () => {
    const user = userEvent.setup()
    renderSearchBar()

    await user.type(screen.getByRole('combobox'), 'WL6')
    await user.click(await screen.findByText('WL6340'))

    expect(pushMock).toHaveBeenCalledWith('/catalog/articles/WL6340')
  })

  it('navigates to the search page on submit', async () => {
    const user = userEvent.setup()
    renderSearchBar()

    await user.type(screen.getByRole('combobox'), 'WL6340 WIX{Enter}')

    expect(pushMock).toHaveBeenCalledWith('/search?q=WL6340+WIX')
  })

  it('includes the selected vehicle in the search navigation', async () => {
    setVehicleContext('v-320d')
    const user = userEvent.setup()
    renderSearchBar()

    await user.type(screen.getByRole('combobox'), 'WL6340{Enter}')

    expect(pushMock).toHaveBeenCalledWith('/search?q=WL6340&vehicleId=v-320d')
  })

  it('does not navigate when the input is blank', async () => {
    const user = userEvent.setup()
    renderSearchBar()

    await user.type(screen.getByRole('combobox'), '  {Enter}')

    expect(pushMock).not.toHaveBeenCalled()
  })

  it('closes the suggestion dropdown on Escape', async () => {
    const user = userEvent.setup()
    renderSearchBar()

    await user.type(screen.getByRole('combobox'), 'WL6')
    await screen.findByRole('listbox')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('supports keyboard selection with arrow keys and Enter', async () => {
    const user = userEvent.setup()
    renderSearchBar()

    await user.type(screen.getByRole('combobox'), 'WL6')
    await screen.findByRole('listbox')

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(pushMock).toHaveBeenCalledWith('/catalog/articles/WL6341')
  })
})
