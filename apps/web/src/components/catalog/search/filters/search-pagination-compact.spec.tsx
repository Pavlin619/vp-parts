import { render, screen } from '@testing-library/react'
import { SearchMode } from '@vp-parts-shop/shared'
import { newSearch, type SearchUrlState } from '@/lib/catalog/search-url'
import { SearchPaginationCompact } from './search-pagination-compact'

// ── Helpers ──────────────────────────────────────────────────────────────────

function state(overrides: Partial<SearchUrlState> = {}): SearchUrlState {
  return {
    ...newSearch({ query: 'филтър', mode: SearchMode.Generic }),
    ...overrides,
  }
}

function renderCompact({
  maxPage = 5,
  ...stateOverrides
}: Partial<SearchUrlState> & { maxPage?: number } = {}) {
  return render(
    <SearchPaginationCompact state={state(stateOverrides)} maxPage={maxPage} />,
  )
}

function hrefOf(name: RegExp | string): string {
  return decodeURIComponent(
    screen.getByRole('link', { name }).getAttribute('href') ?? '',
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SearchPaginationCompact', () => {
  it('renders nothing when every match fits on one page', () => {
    const { container } = renderCompact({ maxPage: 1 })

    expect(container).toBeEmptyDOMElement()
  })

  it('shows the current page against the last one', () => {
    renderCompact({ page: 2 })

    expect(screen.getByText('2/5')).toBeInTheDocument()
  })

  // "2/5" is unreadable aloud, so the position is also spelled out.
  it('spells the position out for assistive technology', () => {
    renderCompact({ page: 2 })

    expect(screen.getByText('Страница 2 от 5')).toBeInTheDocument()
  })

  it('links forward and back from the middle', () => {
    renderCompact({ page: 3 })

    expect(hrefOf('Предишна страница')).toContain('page=2')
    expect(hrefOf('Следваща страница')).toContain('page=4')
  })

  it('keeps every filter in the step links', () => {
    renderCompact({
      page: 1,
      brandIds: ['268'],
      categoryPath: ['1052'],
      categoryHasChildren: false,
      attributes: [{ criteriaId: '20', value: '47' }],
    })

    const href = hrefOf('Следваща страница')
    expect(href).toContain('brand=268')
    expect(href).toContain('cat=1052')
    expect(href).toContain('attr=20:47')
    expect(href).toContain('page=2')
  })

  // A step that leads nowhere must not be focusable or followable.
  it('renders the previous step as inert on the first page', () => {
    renderCompact()

    expect(
      screen.queryByRole('link', { name: 'Предишна страница' }),
    ).not.toBeInTheDocument()
  })

  it('renders the next step as inert on the last page', () => {
    renderCompact({ page: 5 })

    expect(
      screen.queryByRole('link', { name: 'Следваща страница' }),
    ).not.toBeInTheDocument()
  })

  // A filter can shrink the result set under a page number still in the URL.
  it('treats a page past the end as the last page', () => {
    renderCompact({ page: 99 })

    expect(screen.getByText('5/5')).toBeInTheDocument()
    expect(hrefOf('Предишна страница')).toContain('page=4')
  })

  // Both pagers are landmarks on the same page, so they cannot share a name.
  it('names itself apart from the full pager below the results', () => {
    renderCompact()

    expect(
      screen.getByRole('navigation', { name: 'Навигация по страници' }),
    ).toBeInTheDocument()
  })
})
