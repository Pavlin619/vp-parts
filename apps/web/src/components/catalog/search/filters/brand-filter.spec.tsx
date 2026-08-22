import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchMode, type FacetValueDto } from '@vp-parts-shop/shared'
import { newSearch, type SearchUrlState } from '@/lib/catalog/search-url'
import { BrandFilter } from './brand-filter'

// ── Helpers ──────────────────────────────────────────────────────────────────

function state(overrides: Partial<SearchUrlState> = {}): SearchUrlState {
  return {
    ...newSearch({ query: 'филтър', mode: SearchMode.Generic }),
    ...overrides,
  }
}

function brand(id: string, label: string, count = 5): FacetValueDto {
  return { id, label, count, imageUrl: null }
}

const BRANDS = [brand('268', 'WIX'), brand('30', 'Bosch'), brand('77', 'Mann')]

/** Twelve brands, enough to trigger both the text filter and the collapse. */
const MANY_BRANDS = Array.from({ length: 12 }, (_, index) =>
  brand(String(index), `Brand ${String(index).padStart(2, '0')}`),
)

/** The scale TecDoc can answer a broad search with. */
const HUNDREDS_OF_BRANDS = Array.from({ length: 200 }, (_, index) =>
  brand(String(index), `Brand ${String(index).padStart(3, '0')}`),
)

function hrefOf(name: RegExp): string {
  return decodeURIComponent(
    screen.getByRole('link', { name }).getAttribute('href') ?? '',
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BrandFilter', () => {
  it('lists each brand with its match count', () => {
    render(<BrandFilter state={state()} values={BRANDS} />)

    expect(screen.getByText('WIX')).toBeInTheDocument()
    expect(screen.getAllByText('(5)')).toHaveLength(3)
  })

  // TecDoc's facet counts carry no sort field, so the order it answers in is
  // unspecified — and the visitor arrives knowing the name they are after.
  it('orders the brands alphabetically rather than as TecDoc sent them', () => {
    render(<BrandFilter state={state()} values={BRANDS} />)

    const names = screen
      .getAllByRole('listitem')
      .map((item) => item.textContent)

    expect(names[0]).toContain('Bosch')
    expect(names[1]).toContain('Mann')
    expect(names[2]).toContain('WIX')
  })

  it('renders nothing when the API returned no brand facet', () => {
    const { container } = render(<BrandFilter state={state()} values={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  describe('selection', () => {
    it('adds an unselected brand', () => {
      render(<BrandFilter state={state()} values={BRANDS} />)

      expect(hrefOf(/WIX.*добави/)).toContain('brand=268')
    })

    it('removes a selected brand', () => {
      render(<BrandFilter state={state({ brandIds: ['268'] })} values={BRANDS} />)

      expect(hrefOf(/WIX.*премахни/)).not.toContain('brand=268')
    })

    it('keeps the other selections when removing one', () => {
      render(
        <BrandFilter state={state({ brandIds: ['268', '30'] })} values={BRANDS} />,
      )

      expect(hrefOf(/WIX.*премахни/)).toContain('brand=30')
    })

    it('clears every brand at once', () => {
      render(<BrandFilter state={state({ brandIds: ['268'] })} values={BRANDS} />)

      expect(hrefOf(/Изчисти/)).not.toContain('brand=')
    })

    it('offers no clear action when nothing is selected', () => {
      render(<BrandFilter state={state()} values={BRANDS} />)

      expect(screen.queryByRole('link', { name: 'Изчисти' })).not.toBeInTheDocument()
    })
  })

  describe('long lists', () => {
    it('collapses to the first ten brands', () => {
      render(<BrandFilter state={state()} values={MANY_BRANDS} />)

      expect(screen.getByText('Brand 09')).toBeInTheDocument()
      expect(screen.queryByText('Brand 10')).not.toBeInTheDocument()
    })

    it('reveals the last few in one click when that is all there is', async () => {
      const user = userEvent.setup()
      render(<BrandFilter state={state()} values={MANY_BRANDS} />)

      await user.click(screen.getByRole('button', { name: 'Покажи още 2' }))

      expect(screen.getByText('Brand 11')).toBeInTheDocument()
    })

    // A selection hidden below the collapse point is a filter that cannot be
    // removed from the block that applied it.
    it('always shows a selected brand, even past the collapse point', () => {
      render(<BrandFilter state={state({ brandIds: ['11'] })} values={MANY_BRANDS} />)

      expect(screen.getByText('Brand 11')).toBeInTheDocument()
    })

    it('filters the list as the visitor types', async () => {
      const user = userEvent.setup()
      render(<BrandFilter state={state()} values={MANY_BRANDS} />)

      await user.type(screen.getByRole('searchbox', { name: 'Търсене на марка' }), '03')

      expect(screen.getByText('Brand 03')).toBeInTheDocument()
      expect(screen.queryByText('Brand 04')).not.toBeInTheDocument()
    })

    it('keeps a selected brand visible while the list is filtered', async () => {
      const user = userEvent.setup()
      render(<BrandFilter state={state({ brandIds: ['5'] })} values={MANY_BRANDS} />)

      await user.type(screen.getByRole('searchbox', { name: 'Търсене на марка' }), '03')

      expect(screen.getByText('Brand 05')).toBeInTheDocument()
    })

    it('says so when nothing matches the typed text', async () => {
      const user = userEvent.setup()
      render(<BrandFilter state={state()} values={MANY_BRANDS} />)

      await user.type(
        screen.getByRole('searchbox', { name: 'Търсене на марка' }),
        'zzzz',
      )

      expect(screen.getByText('Няма съвпадащи марки.')).toBeInTheDocument()
    })

    // Three brands fit on screen; a search box over them is noise.
    it('offers no text filter for a short list', () => {
      render(<BrandFilter state={state()} values={BRANDS} />)

      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    })
  })

  // Revealing the remainder of a couple of hundred suppliers in one go trades a
  // short list for an unreadable one.
  describe('hundreds of brands', () => {
    function showMore() {
      return screen.getByRole('button', { name: /Покажи още/ })
    }

    it('promises a batch rather than the whole remainder', () => {
      render(<BrandFilter state={state()} values={HUNDREDS_OF_BRANDS} />)

      expect(showMore()).toHaveTextContent('Покажи още 10 от 190')
    })

    it('adds only that batch when clicked', async () => {
      const user = userEvent.setup()
      render(<BrandFilter state={state()} values={HUNDREDS_OF_BRANDS} />)

      await user.click(showMore())

      expect(screen.getByText('Brand 019')).toBeInTheDocument()
      expect(screen.queryByText('Brand 020')).not.toBeInTheDocument()
      expect(showMore()).toHaveTextContent('Покажи още 10 от 180')
    })

    it('folds all the way back to the first ten', async () => {
      const user = userEvent.setup()
      render(<BrandFilter state={state()} values={HUNDREDS_OF_BRANDS} />)

      await user.click(showMore())
      await user.click(showMore())
      await user.click(screen.getByRole('button', { name: 'Покажи по-малко' }))

      expect(screen.queryByText('Brand 010')).not.toBeInTheDocument()
    })

    it('offers no way back before anything has been revealed', () => {
      render(<BrandFilter state={state()} values={HUNDREDS_OF_BRANDS} />)

      expect(
        screen.queryByRole('button', { name: 'Покажи по-малко' }),
      ).not.toBeInTheDocument()
    })

    // A single letter still matches far more than fits, so the cap has to
    // survive the text filter rather than being bypassed by it.
    it('caps the filtered list too', async () => {
      const user = userEvent.setup()
      render(<BrandFilter state={state()} values={HUNDREDS_OF_BRANDS} />)

      await user.type(
        screen.getByRole('searchbox', { name: 'Търсене на марка' }),
        'Brand 1',
      )

      expect(screen.getByText('Brand 109')).toBeInTheDocument()
      expect(screen.queryByText('Brand 110')).not.toBeInTheDocument()
    })

    it('starts the reveal over when the term changes', async () => {
      const user = userEvent.setup()
      render(<BrandFilter state={state()} values={HUNDREDS_OF_BRANDS} />)

      await user.click(showMore())
      await user.type(
        screen.getByRole('searchbox', { name: 'Търсене на марка' }),
        'Brand 0',
      )

      expect(screen.queryByText('Brand 010')).not.toBeInTheDocument()
    })
  })
})
