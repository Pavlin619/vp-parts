import { render, screen } from '@testing-library/react'
import { SearchMode } from '@vp-parts-shop/shared'
import { newSearch, type SearchUrlState } from '@/lib/catalog/search-url'
import { SearchPagination, pageWindow } from './search-pagination'

// ── Helpers ──────────────────────────────────────────────────────────────────

function state(overrides: Partial<SearchUrlState> = {}): SearchUrlState {
  return {
    ...newSearch({ query: 'филтър', mode: SearchMode.Generic }),
    ...overrides,
  }
}

/**
 * `maxPage` defaults to the page count the match set implies, which is what the
 * API sends whenever TecDoc's paging cap is not the binding constraint. Tests
 * about the cap pass a lower one explicitly.
 */
function renderPagination({
  total = 87,
  pageSize = 20,
  maxPage = Math.ceil(total / pageSize),
  ...stateOverrides
}: Partial<SearchUrlState> & {
  total?: number
  pageSize?: number
  maxPage?: number
} = {}) {
  return render(
    <SearchPagination
      state={state(stateOverrides)}
      total={total}
      pageSize={pageSize}
      maxPage={maxPage}
    />,
  )
}

function hrefOf(name: RegExp | string): string {
  return decodeURIComponent(
    screen.getByRole('link', { name }).getAttribute('href') ?? '',
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SearchPagination', () => {
  it('renders nothing when every match fits on one page', () => {
    const { container } = renderPagination({ total: 12 })

    expect(container).toBeEmptyDOMElement()
  })

  it('says which slice of the matches is on screen', () => {
    renderPagination({ page: 3 })

    expect(screen.getByText(/Показани 41–60 от 87 артикула/)).toBeInTheDocument()
  })

  it('caps the last page at the match count', () => {
    renderPagination({ page: 5 })

    expect(screen.getByText(/Показани 81–87 от 87/)).toBeInTheDocument()
  })

  it('marks the current page for assistive technology', () => {
    renderPagination({ page: 2 })

    expect(screen.getByRole('link', { name: 'Страница 2' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('keeps every filter in the page links', () => {
    renderPagination({
      page: 1,
      brandIds: ['268'],
      categoryPath: ['1052'],
      categoryHasChildren: false,
      attributes: [{ criteriaId: '20', value: '47' }],
    })

    const href = hrefOf('Страница 2')
    expect(href).toContain('brand=268')
    expect(href).toContain('cat=1052')
    expect(href).toContain('attr=20:47')
    expect(href).toContain('page=2')
  })

  describe('steps', () => {
    it('links forward and back from the middle', () => {
      renderPagination({ page: 3 })

      expect(hrefOf(/Предишна/)).toContain('page=2')
      expect(hrefOf(/Следваща/)).toContain('page=4')
    })

    // A step that leads nowhere must not be focusable or followable.
    it('renders the previous step as inert on the first page', () => {
      renderPagination()

      expect(screen.queryByRole('link', { name: /Предишна/ })).not.toBeInTheDocument()
    })

    it('renders the next step as inert on the last page', () => {
      renderPagination({ page: 5 })

      expect(screen.queryByRole('link', { name: /Следваща/ })).not.toBeInTheDocument()
    })

    // A filter can shrink the result set under a page number still in the URL.
    it('treats a page past the end as the last page', () => {
      renderPagination({ page: 99 })

      expect(screen.queryByRole('link', { name: /Следваща/ })).not.toBeInTheDocument()
      expect(hrefOf(/Предишна/)).toContain('page=4')
    })
  })

  // TecDoc serves only the first ~10,000 results of a match set, so a broad
  // query reports far more matches than it will ever page through. Sizing the
  // pager from the match count would link to pages the API cannot answer.
  describe('when the API caps how deep the results go', () => {
    const capped = { total: 50_000, maxPage: 500 }

    it('ends the pager at the cap rather than at the match count', () => {
      renderPagination({ ...capped, page: 500 })

      expect(
        screen.queryByRole('link', { name: /Следваща/ }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('link', { name: 'Страница 501' }),
      ).not.toBeInTheDocument()
    })

    it('offers the page before the cap', () => {
      renderPagination({ ...capped, page: 499 })

      expect(hrefOf(/Следваща/)).toContain('page=500')
    })

    // Ending without a word would read as a bug once the numbers stop short of
    // the count printed beside them.
    it('says how much of the match set is within reach', () => {
      renderPagination({ ...capped, page: 1 })

      expect(
        screen.getByText(/от 50000 артикула \(достъпни са първите 10000\)/),
      ).toBeInTheDocument()
    })

    it('stays quiet when the whole match set is reachable', () => {
      renderPagination({ page: 1 })

      expect(screen.queryByText(/достъпни/)).not.toBeInTheDocument()
    })

    it('treats a hand-typed page past the cap as the last page', () => {
      renderPagination({ ...capped, page: 900 })

      expect(hrefOf(/Предишна/)).toContain('page=499')
    })
  })
})

describe('pageWindow', () => {
  it('shows every page when they fit in the window', () => {
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4])
  })

  it('centres the window on the current page', () => {
    expect(pageWindow(10, 20)).toEqual([7, 8, 9, 10, 11, 12, 13])
  })

  it('clamps the window to the start', () => {
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('clamps the window to the end', () => {
    expect(pageWindow(20, 20)).toEqual([14, 15, 16, 17, 18, 19, 20])
  })
})
