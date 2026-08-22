import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchMode, type AutocompleteItemDto } from '@vp-parts-shop/shared'
import { SearchBar } from './search-bar'

// ── Mocks ──────────────────────────────────────────────────────────────────

const pushMock = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const getAutocompleteMock = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  autocompleteQueryOptions: (query: string, mode: string) => ({
    queryKey: ['catalog', 'autocomplete', mode, query] as const,
    queryFn: () =>
      getAutocompleteMock(query, mode) as Promise<AutocompleteItemDto[]>,
  }),
}))

jest.mock('@/hooks/use-vehicle-context', () => ({
  useVehicleContext: jest.fn(),
  // The persisted scope is read during render, so the component holds it back
  // until hydration; these tests want the post-hydration behaviour.
  useHydration: () => true,
}))

import { useVehicleContext } from '@/hooks/use-vehicle-context'
import { useSearchModeStore } from '@/hooks/use-search-mode'

const mockUseVehicleContext = jest.mocked(useVehicleContext)

// ── Helpers ────────────────────────────────────────────────────────────────

const SUGGESTIONS: AutocompleteItemDto[] = [
  {
    kind: 'article',
    articleNumber: 'WL6340',
    brandId: '268',
    brandName: 'WIX',
    description: 'Oil Filter',
  },
  {
    kind: 'article',
    articleNumber: 'WL6341',
    brandId: '268',
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

/** Puts the box in the number scope, as choosing it in the selector would. */
function usePartNumberScope(isExact = false) {
  useSearchModeStore.setState({ scope: 'part', isExact })
}

/** The last URL pushed, decoded so assertions stay readable. */
function pushedUrl(): string {
  return decodeURIComponent(String(pushMock.mock.calls.at(-1)?.[0]))
}

beforeEach(() => {
  jest.clearAllMocks()
  setVehicleContext(null)
  useSearchModeStore.setState({ scope: 'generic', isExact: false })
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
        kind: 'article',
        articleNumber: `WL63${i}`,
        brandId: '268',
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

    expect(pushMock).toHaveBeenCalledWith('/catalog/articles/268/WL6340')
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

    expect(pushMock).toHaveBeenCalledWith('/catalog/articles/268/WL6341')
  })

  it('includes the selected vehicle in the search navigation', async () => {
    setVehicleContext('v-320d')
    usePartNumberScope()
    const user = userEvent.setup()
    renderSearchBar()

    await user.type(screen.getByRole('combobox'), 'WL6340{Enter}')

    expect(pushedUrl()).toBe('/search?q=WL6340&vehicleId=v-320d')
  })

  describe('search mode', () => {
    // The mode picks the TecDoc strategy, so it has to travel with the query
    // rather than be applied to the results afterwards.
    it('puts the mode in the search URL', async () => {
      const user = userEvent.setup()
      renderSearchBar()

      await user.type(screen.getByRole('combobox'), 'въздушен филтър{Enter}')

      expect(pushedUrl()).toBe('/search?q=въздушен+филтър&mode=generic')
    })

    it('omits the mode when it is the API default', async () => {
      usePartNumberScope()
      const user = userEvent.setup()
      renderSearchBar()

      await user.type(screen.getByRole('combobox'), 'WL6340 WIX{Enter}')

      expect(pushedUrl()).toBe('/search?q=WL6340+WIX')
    })

    it('sends the exact mode when the switch is on', async () => {
      usePartNumberScope(true)
      const user = userEvent.setup()
      renderSearchBar()

      await user.type(screen.getByRole('combobox'), 'WL6340{Enter}')

      expect(pushedUrl()).toContain('mode=part_number_exact')
    })

    it('asks autocomplete for the same mode the search will run in', async () => {
      const user = userEvent.setup()
      renderSearchBar()

      await user.type(screen.getByRole('combobox'), 'фил')

      await waitFor(() => {
        expect(getAutocompleteMock).toHaveBeenCalledWith('фил', SearchMode.Generic)
      })
    })

    // "Exact" qualifies how a number is matched and means nothing for free
    // text, so the control must not be offered there at all.
    it('offers the exact switch only in the number scope', () => {
      const { unmount } = renderSearchBar()
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
      unmount()

      usePartNumberScope()
      renderSearchBar()

      expect(screen.getByRole('switch')).toBeInTheDocument()
    })

    it('toggles the exact switch with Alt+E in the number scope', async () => {
      usePartNumberScope()
      const user = userEvent.setup()
      renderSearchBar()

      screen.getByRole('combobox').focus()
      await user.keyboard('{Alt>}e{/Alt}')

      expect(useSearchModeStore.getState().isExact).toBe(true)
    })
  })

  describe('when a part number is typed into a descriptive search', () => {
    beforeEach(() => {
      getAutocompleteMock.mockResolvedValue([])
    })

    // The number lane cannot match a description and vice versa, so returning
    // nothing without explanation is the worst outcome here.
    it('offers to re-run it as a number search', async () => {
      const user = userEvent.setup()
      renderSearchBar()

      await user.type(screen.getByRole('combobox'), '13717521033')

      expect(
        await screen.findByRole('button', { name: /Търси като номер/ }),
      ).toBeInTheDocument()
    })

    it('switches the scope and searches when taken up', async () => {
      const user = userEvent.setup()
      renderSearchBar()

      await user.type(screen.getByRole('combobox'), '13717521033')
      await user.click(
        await screen.findByRole('button', { name: /Търси като номер/ }),
      )

      expect(pushedUrl()).toBe('/search?q=13717521033')
      expect(useSearchModeStore.getState().scope).toBe('part')
    })

    it('stays quiet for a descriptive query', async () => {
      const user = userEvent.setup()
      renderSearchBar()

      await user.type(screen.getByRole('combobox'), 'въздушен филтър')

      expect(
        screen.queryByRole('button', { name: /Търси като номер/ }),
      ).not.toBeInTheDocument()
    })
  })

  // The mirror case, and the likelier one now that the number scope is the
  // preselected default.
  describe('when a description is typed into a number search', () => {
    beforeEach(() => {
      getAutocompleteMock.mockResolvedValue([])
      usePartNumberScope()
    })

    it('offers to re-run it as a descriptive search', async () => {
      const user = userEvent.setup()
      renderSearchBar()

      await user.type(screen.getByRole('combobox'), 'въздушен филтър')

      expect(
        await screen.findByRole('button', { name: /Търси по описание/ }),
      ).toBeInTheDocument()
    })

    it('switches the scope and searches when taken up', async () => {
      const user = userEvent.setup()
      renderSearchBar()

      await user.type(screen.getByRole('combobox'), 'въздушен филтър')
      await user.click(
        await screen.findByRole('button', { name: /Търси по описание/ }),
      )

      expect(pushedUrl()).toBe('/search?q=въздушен+филтър&mode=generic')
      expect(useSearchModeStore.getState().scope).toBe('generic')
    })

    it('stays quiet for a part number', async () => {
      const user = userEvent.setup()
      renderSearchBar()

      await user.type(screen.getByRole('combobox'), '13717521033')

      expect(
        screen.queryByRole('button', { name: /Търси по описание/ }),
      ).not.toBeInTheDocument()
    })
  })

  describe('suggestion kinds', () => {
    it('runs a term suggestion as a free-text search', async () => {
      getAutocompleteMock.mockResolvedValue([
        { kind: 'term', term: 'маслен филтър' },
      ])
      const user = userEvent.setup()
      renderSearchBar()

      await user.type(screen.getByRole('combobox'), 'мас')
      await user.click(await screen.findByText('маслен филтър'))

      expect(pushedUrl()).toBe('/search?q=маслен+филтър&mode=generic')
    })

    it('narrows to the category a category suggestion names', async () => {
      getAutocompleteMock.mockResolvedValue([
        {
          kind: 'category',
          term: 'WL6340',
          categoryNodeId: '1052',
          label: 'Маслен филтър',
          count: 12,
        },
      ])
      const user = userEvent.setup()
      renderSearchBar()

      await user.type(screen.getByRole('combobox'), 'WL6')
      await user.click(await screen.findByText('Маслен филтър'))

      expect(pushedUrl()).toContain('cat=1052')
      expect(pushedUrl()).toContain('catHasChildren=false')
    })
  })
})
