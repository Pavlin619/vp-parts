import {
  buildSearchUrl,
  clearAllFilters,
  facetScopeKey,
  hasActiveFilters,
  parseSearchUrl,
  toSearchRequest,
  withStockScope,
} from './index'
import { query, state } from './fixtures'

describe('the stock scope', () => {
  it('is read from the URL', () => {
    expect(parseSearchUrl({ q: 'x', stock: 'central' }).stockScope).toBe(
      'central',
    )
  })

  it('is absent when the param is, which means every origin', () => {
    expect(parseSearchUrl({ q: 'x' }).stockScope).toBeUndefined()
  })

  // The API rejects an origin it does not recognise, so a hand-edited URL has
  // to widen the search rather than 400 it.
  it('is dropped when it names no origin we know', () => {
    expect(parseSearchUrl({ q: 'x', stock: 'moon' }).stockScope).toBeUndefined()
  })

  it('round-trips through the built URL', () => {
    expect(query(buildSearchUrl(state({ stockScope: 'external' })))).toContain(
      'stock=external',
    )
  })

  it('is left out of the URL when no origin is selected', () => {
    expect(query(buildSearchUrl(state()))).not.toContain('stock=')
  })

  it('reaches the search request', () => {
    expect(toSearchRequest(state({ stockScope: 'central' })).stockScope).toBe(
      'central',
    )
  })

  // A narrowed set is shorter, so the page the visitor was on may be past its
  // end.
  it('returns to the first page when it changes', () => {
    expect(withStockScope(state({ page: 4 }), 'central').page).toBe(1)
  })

  // It narrows the ranked set rather than the match set, so the facet ids stay
  // valid and dropping them would silently widen the search.
  it('keeps every facet selection when it changes', () => {
    const narrowed = withStockScope(
      state({ brandIds: ['268'], productTypeId: '7' }),
      'central',
    )

    expect(narrowed.brandIds).toEqual(['268'])
    expect(narrowed.productTypeId).toBe('7')
  })

  it('is cleared by passing no origin', () => {
    expect(
      withStockScope(state({ stockScope: 'central' }), undefined).stockScope,
    ).toBeUndefined()
  })

  it('counts as an active filter, so an empty result keeps the sidebar', () => {
    expect(hasActiveFilters(state({ stockScope: 'central' }))).toBe(true)
  })

  it('is dropped by clearing all filters', () => {
    expect(
      clearAllFilters(state({ stockScope: 'central' })).stockScope,
    ).toBeUndefined()
  })

  // The facets describe what TecDoc matched, which is the same list whichever
  // origin is selected — re-keying on it would throw away a retained block.
  it('does not change the facet scope', () => {
    expect(facetScopeKey(state({ stockScope: 'central' }))).toBe(
      facetScopeKey(state()),
    )
  })
})
