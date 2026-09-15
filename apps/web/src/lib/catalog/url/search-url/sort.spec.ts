import { DEFAULT_SEARCH_SORT, SearchSort } from '@vp-parts-shop/shared'
import {
  buildSearchUrl,
  clearAllFilters,
  facetScopeKey,
  hasActiveFilters,
  parseSearchUrl,
  toSearchRequest,
  withSort,
} from './index'
import { query, state } from './fixtures'

describe('the sort', () => {
  it('is read from the URL', () => {
    expect(parseSearchUrl({ q: 'x', sort: 'price_asc' }).sort).toBe(
      SearchSort.PriceAscending,
    )
  })

  // There is no unordered list: an absent param means the default order, which
  // is why this is the one URL field with no undefined state.
  it('is the default when the param is absent', () => {
    expect(parseSearchUrl({ q: 'x' }).sort).toBe(DEFAULT_SEARCH_SORT)
  })

  it('falls back to the default when it names an order we do not offer', () => {
    expect(parseSearchUrl({ q: 'x', sort: 'cheapest' }).sort).toBe(
      DEFAULT_SEARCH_SORT,
    )
  })

  it('round-trips through the built URL', () => {
    expect(
      query(buildSearchUrl(state({ sort: SearchSort.ArticleNumber }))),
    ).toContain('sort=article_number')
  })

  // Two equivalent searches must produce one URL, and therefore one cache entry.
  it('is left out of the URL when it is the default', () => {
    expect(query(buildSearchUrl(state({ sort: DEFAULT_SEARCH_SORT })))).not.toContain(
      'sort=',
    )
  })

  it('reaches the search request', () => {
    expect(toSearchRequest(state({ sort: SearchSort.PriceDescending })).sort).toBe(
      SearchSort.PriceDescending,
    )
  })

  // Re-ordering moves the rows rather than shortening the list, so the page the
  // visitor was on describes nothing in the new order.
  it('returns to the first page when it changes', () => {
    expect(withSort(state({ page: 4 }), SearchSort.Brand).page).toBe(1)
  })

  it('keeps every narrowing when it changes', () => {
    const sorted = withSort(
      state({ brandIds: ['268'], productTypeId: '7', stockScope: 'central' }),
      SearchSort.Brand,
    )

    expect(sorted.brandIds).toEqual(['268'])
    expect(sorted.productTypeId).toBe('7')
    expect(sorted.stockScope).toBe('central')
  })

  /**
   * An order is not a narrowing. Counted as one, an empty result set sorted by
   * price would blame the emptiness on a filter and offer to clear a control
   * that removed nothing.
   */
  it('is not an active filter', () => {
    expect(hasActiveFilters(state({ sort: SearchSort.PriceAscending }))).toBe(
      false,
    )
  })

  it('survives clearing all filters', () => {
    expect(clearAllFilters(state({ sort: SearchSort.Brand })).sort).toBe(
      SearchSort.Brand,
    )
  })

  // Re-ordering narrows nothing, so it cannot change what the facets count.
  it('does not change the facet scope', () => {
    expect(facetScopeKey(state({ sort: SearchSort.PriceDescending }))).toBe(
      facetScopeKey(state()),
    )
  })
})
