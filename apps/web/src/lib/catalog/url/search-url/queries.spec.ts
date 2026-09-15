import { SearchMode } from '@vp-parts-shop/shared'
import {
  countActiveFilters,
  facetScopeKey,
  hasDimensions,
  hasSearchSubject,
  isNarrowedSearch,
  isPageOutOfRange,
} from './index'
import { state } from './fixtures'

// Mirrors the API's own gate (`shouldRequestCriteriaFacets`) minus the page,
// which the sidebar answers with facet retention instead. Both sides read the
// rule from `hasCoherentDimensions` in the shared package.
describe('hasDimensions', () => {
  it('is false for a broad search with nothing selected', () => {
    expect(hasDimensions(state())).toBe(false)
  })

  it('is false at a category the client reported as a branch', () => {
    expect(
      hasDimensions(state({ categoryPath: ['100'], categoryHasChildren: true })),
    ).toBe(false)
  })

  // An absent hint is how a caller declines the criteria block, so it must not
  // read as a leaf.
  it('is false at a category with no leaf hint at all', () => {
    expect(hasDimensions(state({ categoryPath: ['100'] }))).toBe(false)
  })

  it('is true at a leaf category', () => {
    expect(
      hasDimensions(
        state({ categoryPath: ['100', '1052'], categoryHasChildren: false }),
      ),
    ).toBe(true)
  })

  // TecDoc defines criteria per generic article, so one product type is a
  // homogeneous set on its own — this is the case the API already returned a
  // criteria block for while the sidebar refused to render it.
  it('is true for a product type with no category selected', () => {
    expect(hasDimensions(state({ productTypeId: '7' }))).toBe(true)
  })

  it('is true for a product type under a branch category', () => {
    expect(
      hasDimensions(
        state({
          categoryPath: ['100'],
          categoryHasChildren: true,
          productTypeId: '7',
        }),
      ),
    ).toBe(true)
  })
})

describe('isPageOutOfRange', () => {
  it('is false on the first page of a single-page result set', () => {
    expect(isPageOutOfRange(state({ page: 1 }), 1)).toBe(false)
  })

  it('is false on the last page that exists', () => {
    expect(isPageOutOfRange(state({ page: 5 }), 5)).toBe(false)
  })

  it('is true one page past the end', () => {
    expect(isPageOutOfRange(state({ page: 6 }), 5)).toBe(true)
  })

  it('is true for a page far past the end', () => {
    expect(isPageOutOfRange(state({ page: 999_999 }), 5)).toBe(true)
  })

  // An empty result set has no page to redirect to, and page 1 of nothing is
  // where the no-matches copy belongs.
  it('is false for an empty result set', () => {
    expect(isPageOutOfRange(state({ page: 1 }), 0)).toBe(false)
  })

  // Reaching a later page of a set that has since emptied must not bounce
  // between pages — there is no in-range page to land on.
  it('is false for an empty result set reached on a later page', () => {
    expect(isPageOutOfRange(state({ page: 3 }), 0)).toBe(false)
  })
})

describe('facetScopeKey', () => {
  // Paging must not drop the retained dimension block: only page 1 carries one.
  it('is stable across pages', () => {
    expect(facetScopeKey(state({ page: 1 }))).toBe(facetScopeKey(state({ page: 3 })))
  })

  it('is stable across attribute selections', () => {
    const selected = state({ attributes: [{ criteriaId: '20', value: '106.4' }] })

    expect(facetScopeKey(selected)).toBe(facetScopeKey(state()))
  })

  it('ignores the order brands were selected in', () => {
    expect(facetScopeKey(state({ brandIds: ['30', '268'] }))).toBe(
      facetScopeKey(state({ brandIds: ['268', '30'] })),
    )
  })

  it.each([
    ['query', state({ query: 'other' })],
    ['mode', state({ mode: SearchMode.Generic })],
    ['vehicle', state({ vehicleId: 'v-1' })],
    ['category', state({ categoryPath: ['1052'] })],
    ['brands', state({ brandIds: ['268'] })],
    ['product type', state({ productTypeId: '7' })],
  ])('changes when the %s changes', (_name, changed) => {
    expect(facetScopeKey(changed)).not.toBe(facetScopeKey(state()))
  })
})

/**
 * The vehicle is a narrowing but not one `clearAllFilters` removes, so it is
 * counted here and not in `hasActiveFilters`. Left out of both, a vehicle-scoped
 * search that matches nothing would be read as a query that matches nothing and
 * sent to the dead-end empty state — losing the sidebar, and with it the only
 * control that can widen it again.
 */
describe('isNarrowedSearch', () => {
  it('is false for a bare query', () => {
    expect(isNarrowedSearch(state())).toBe(false)
  })

  it('is true when the search is scoped to a vehicle', () => {
    expect(isNarrowedSearch(state({ vehicleId: '10042' }))).toBe(true)
  })

  it('is true for any filter that clearing removes', () => {
    expect(isNarrowedSearch(state({ brandIds: ['268'] }))).toBe(true)
  })
})

/**
 * The API accepts an empty `q` exactly when a vehicle or a category narrows the
 * search, and rejects it otherwise with a 400. This is the page's copy of that
 * rule, so a state the page will fetch is always a state the API will answer.
 */
describe('hasSearchSubject', () => {
  it('is true for something typed', () => {
    expect(hasSearchSubject(state({ query: 'K20' }))).toBe(true)
  })

  it('is false when nothing was typed and nothing narrows', () => {
    expect(hasSearchSubject(state({ query: '' }))).toBe(false)
  })

  // The catalogue page links straight here with no query at all.
  it('is true for a category browse with nothing typed', () => {
    expect(
      hasSearchSubject(state({ query: '', categoryPath: ['100259'] })),
    ).toBe(true)
  })

  it('is true for a vehicle browse with nothing typed', () => {
    expect(hasSearchSubject(state({ query: '', vehicleId: '11340' }))).toBe(
      true,
    )
  })

  it('is true for a vehicle and a category together', () => {
    expect(
      hasSearchSubject(
        state({ query: '', vehicleId: '11340', categoryPath: ['100259'] }),
      ),
    ).toBe(true)
  })

  /**
   * Deliberately narrower than `isNarrowedSearch`: these axes narrow a result
   * set but cannot stand alone as a subject, and the API refuses them — asking
   * for every part BOSCH makes is a catalogue-wide read, not a search.
   */
  it.each([
    ['a brand', { brandIds: ['268'] }],
    ['a product type', { productTypeId: '7' }],
    ['a stock scope', { stockScope: 'central' as const }],
    ['an attribute', { attributes: [{ criteriaId: '20', value: '106.4' }] }],
  ])('is false when narrowed only by %s', (_label, narrowing) => {
    expect(hasSearchSubject(state({ query: '', ...narrowing }))).toBe(false)
  })
})

describe('countActiveFilters', () => {
  it('counts nothing for a bare query', () => {
    expect(countActiveFilters(state())).toBe(0)
  })

  it('counts every brand and every attribute separately', () => {
    expect(
      countActiveFilters(
        state({
          brandIds: ['268', '2'],
          attributes: [
            { criteriaId: '20', value: '106.4' },
            { criteriaId: '100', value: 'VL' },
          ],
        }),
      ),
    ).toBe(4)
  })

  // The drill is one selection with a trail behind it, not one per level.
  it('counts a category path once however deep it is', () => {
    expect(countActiveFilters(state({ categoryPath: ['100', '1052', '9021'] }))).toBe(1)
  })

  it('counts the product type on top of the category it sits under', () => {
    expect(
      countActiveFilters(state({ categoryPath: ['1052'], productTypeId: '7' })),
    ).toBe(2)
  })

  it('counts the vehicle, which narrows the search like any other axis', () => {
    expect(countActiveFilters(state({ vehicleId: '10042' }))).toBe(1)
  })

  // Its control lives in the results header, so a visitor sent into the panel
  // by this number would not find it there.
  it('ignores the stock scope', () => {
    expect(countActiveFilters(state({ stockScope: 'central' }))).toBe(0)
  })
})
