import { render, screen } from '@testing-library/react'
import type { StockScopeCountsDto } from '@vp-parts-shop/shared'
import { parseSearchUrl, type SearchUrlState } from '@/lib/catalog/search-url'
import { SearchStockFilter } from './search-stock-filter'

const COUNTS: StockScopeCountsDto = { all: 14, central: 12, external: 6 }

function renderFilter(
  params: Record<string, string> = {},
  counts: StockScopeCountsDto = COUNTS,
) {
  const state: SearchUrlState = parseSearchUrl({ q: 'WL634', ...params })

  return render(<SearchStockFilter state={state} counts={counts} />)
}

function optionHref(name: RegExp): string | null {
  return screen.getByRole('link', { name }).getAttribute('href')
}

describe('SearchStockFilter', () => {
  it('offers every origin with the count the API gave it', () => {
    renderFilter()

    expect(screen.getByRole('link', { name: /Всички\s*14/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /В склад\s*12/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /В пункт\s*6/ })).toBeInTheDocument()
  })

  // The two origins overlap — a part on our shelf that a supplier also holds is
  // in both — so the control must never present them as segments of the total.
  it('renders counts that do not add up to the total without complaint', () => {
    renderFilter({}, { all: 14, central: 12, external: 6 })

    expect(screen.getByRole('link', { name: /Всички\s*14/ })).toBeInTheDocument()
  })

  it('narrows to an origin by putting it in the URL', () => {
    renderFilter()

    expect(optionHref(/В склад/)).toContain('stock=central')
    expect(optionHref(/В пункт/)).toContain('stock=external')
  })

  it('drops the narrowing entirely for the all option', () => {
    renderFilter({ stock: 'central' })

    expect(optionHref(/Всички/)).not.toContain('stock=')
  })

  it('marks the selected origin as current', () => {
    renderFilter({ stock: 'external' })

    expect(screen.getByRole('link', { name: /В пункт/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(screen.getByRole('link', { name: /Всички/ })).not.toHaveAttribute(
      'aria-current',
    )
  })

  // Narrowing returns to page 1: the narrowed set is shorter, so the page the
  // visitor was on may be past its end.
  it('returns to the first page', () => {
    renderFilter({ page: '4' })

    expect(optionHref(/В склад/)).not.toContain('page=')
  })

  // The facets were computed over the match set, which a stock narrowing does
  // not change — dropping them would silently widen the search.
  it('keeps the facet selections it was rendered with', () => {
    renderFilter({ brand: '268', type: '3018' })

    const href = optionHref(/В склад/)
    expect(href).toContain('brand=268')
    expect(href).toContain('type=3018')
  })

  // Dropping an empty option would let the next click land on whichever option
  // slid into its place as stock moved.
  it('keeps an empty origin in place but makes it unclickable', () => {
    renderFilter({}, { all: 14, central: 14, external: 0 })

    expect(screen.getByText(/В пункт/)).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /В пункт/ }),
    ).not.toBeInTheDocument()
  })

  // Otherwise a visitor who narrowed to an origin that has just sold out is
  // left with no way back to the list.
  it('keeps an empty origin clickable while it is the selected one', () => {
    renderFilter({ stock: 'external' }, { all: 14, central: 14, external: 0 })

    expect(screen.getByRole('link', { name: /В пункт/ })).toBeInTheDocument()
  })
})
