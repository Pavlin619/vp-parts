import {
  DEFAULT_SEARCH_SORT,
  SearchMode,
  SearchSort,
} from '@vp-parts-shop/shared'
import {
  buildSearchUrl,
  categoryUp,
  clearAllFilters,
  clearAttributes,
  clearBrands,
  clearCategory,
  clearProductType,
  drillIntoCategory,
  facetScopeKey,
  hasActiveFilters,
  hasDimensions,
  isAttributeSelected,
  isNarrowedSearch,
  isPageOutOfRange,
  newSearch,
  parseSearchUrl,
  selectCategoryPath,
  selectedCategoryId,
  selectProductType,
  toSearchRequest,
  toggleAttribute,
  toggleBrand,
  withMode,
  withPage,
  withSort,
  withoutVehicle,
  withStockScope,
  withVehicle,
  type SearchUrlState,
} from './search-url'

// ── Helpers ──────────────────────────────────────────────────────────────────

function state(overrides: Partial<SearchUrlState> = {}): SearchUrlState {
  return {
    ...newSearch({ query: 'WL6340', mode: SearchMode.PartNumber }),
    ...overrides,
  }
}

/** The built URL's query string, decoded so assertions stay readable. */
function query(built: string): string {
  return decodeURIComponent(built.replace('/search?', ''))
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('parseSearchUrl', () => {
  it('reads the query and trims it', () => {
    expect(parseSearchUrl({ q: '  WL6340  ' }).query).toBe('WL6340')
  })

  it('reads params from a URLSearchParams as well as a plain record', () => {
    const params = new URLSearchParams('q=WL6340&brand=268&brand=30')

    expect(parseSearchUrl(params).brandIds).toEqual(['268', '30'])
  })

  it('accepts a single repeatable param arriving as a bare string', () => {
    expect(parseSearchUrl({ q: 'x', brand: '268' }).brandIds).toEqual(['268'])
  })

  describe('page', () => {
    it('defaults to the first page', () => {
      expect(parseSearchUrl({ q: 'x' }).page).toBe(1)
    })

    it.each(['0', '-3', 'abc', '1.5'])(
      'falls back to the first page for %s',
      (raw) => {
        expect(parseSearchUrl({ q: 'x', page: raw }).page).toBe(1)
      },
    )
  })

  describe('mode', () => {
    it('defaults to the part-number lane', () => {
      expect(parseSearchUrl({ q: 'x' }).mode).toBe(SearchMode.PartNumber)
    })

    it('reads a valid mode', () => {
      expect(parseSearchUrl({ q: 'x', mode: 'generic' }).mode).toBe(
        SearchMode.Generic,
      )
    })

    // A hand-edited mode must not reach the API and 400 an otherwise fine search.
    it('falls back to the default for an unknown mode', () => {
      expect(parseSearchUrl({ q: 'x', mode: 'fuzzy' }).mode).toBe(
        SearchMode.PartNumber,
      )
    })
  })

  describe('category', () => {
    it('reads the drill path in order', () => {
      const parsed = parseSearchUrl({ q: 'x', cat: ['100', '1052'] })

      expect(parsed.categoryPath).toEqual(['100', '1052'])
      expect(selectedCategoryId(parsed)).toBe('1052')
    })

    it('reads an explicit leaf hint', () => {
      const parsed = parseSearchUrl({
        q: 'x',
        cat: '1052',
        catHasChildren: 'false',
      })

      expect(parsed.categoryHasChildren).toBe(false)
    })

    // Only an explicit false opts into the dimension facets, so anything
    // unrecognised must read as "unknown" rather than as a boolean.
    it.each(['', 'yes', 'FALSE', undefined])(
      'treats %s as an absent hint',
      (raw) => {
        const parsed = parseSearchUrl({ q: 'x', cat: '1052', catHasChildren: raw })

        expect(parsed.categoryHasChildren).toBeUndefined()
      },
    )

    it('ignores the hint when no category is selected', () => {
      const parsed = parseSearchUrl({ q: 'x', catHasChildren: 'false' })

      expect(parsed.categoryHasChildren).toBeUndefined()
    })
  })

  describe('product type', () => {
    it('reads the selected product type', () => {
      expect(parseSearchUrl({ q: 'x', type: '7' }).productTypeId).toBe('7')
    })

    it('is absent when the param is missing or empty', () => {
      expect(parseSearchUrl({ q: 'x' }).productTypeId).toBeUndefined()
      expect(parseSearchUrl({ q: 'x', type: '' }).productTypeId).toBeUndefined()
    })

    // A drill level has exactly one value; a hand-edited URL does not get to
    // widen it back into a multi-select.
    it('takes only the first of a repeated param', () => {
      expect(parseSearchUrl({ q: 'x', type: ['7', '9'] }).productTypeId).toBe('7')
    })
  })

  describe('attributes', () => {
    it('splits each pair on the first colon so a value may contain colons', () => {
      const parsed = parseSearchUrl({ q: 'x', attr: '20:10:30' })

      expect(parsed.attributes).toEqual([{ criteriaId: '20', value: '10:30' }])
    })

    // These come from a facet block we served, so a broken one is a hand-edited
    // URL — worth dropping, not worth failing the whole search over.
    it.each(['20', ':106.4', '20:', ''])('drops the malformed entry %s', (raw) => {
      expect(parseSearchUrl({ q: 'x', attr: raw }).attributes).toEqual([])
    })

    it('keeps the good entries alongside a malformed one', () => {
      const parsed = parseSearchUrl({ q: 'x', attr: ['20:106.4', 'broken'] })

      expect(parsed.attributes).toEqual([{ criteriaId: '20', value: '106.4' }])
    })
  })
})

describe('buildSearchUrl', () => {
  it('round-trips a fully narrowed search', () => {
    const original = state({
      query: 'WL6340',
      vehicleId: 'v-1',
      mode: SearchMode.Generic,
      page: 3,
      brandIds: ['268'],
      productTypeId: '7',
      categoryPath: ['100', '1052'],
      categoryHasChildren: false,
      attributes: [{ criteriaId: '20', value: '106.4' }],
    })

    expect(parseSearchUrl(new URLSearchParams(buildSearchUrl(original).split('?')[1]))).toEqual(
      original,
    )
  })

  // Defaults left out keep two equivalent searches on one URL, which is also
  // one API cache entry rather than several.
  it('omits the default mode and the first page', () => {
    expect(query(buildSearchUrl(state()))).toBe('q=WL6340')
  })

  it('repeats the category path in drill order', () => {
    const built = query(buildSearchUrl(state({ categoryPath: ['100', '1052'] })))

    expect(built).toContain('cat=100&cat=1052')
  })

  it('writes the selected product type', () => {
    const built = query(buildSearchUrl(state({ productTypeId: '7' })))

    expect(built).toContain('type=7')
  })

  it('omits the product type when none is selected', () => {
    expect(query(buildSearchUrl(state()))).not.toContain('type=')
  })

  it('omits the leaf hint when no category is selected', () => {
    const built = query(
      buildSearchUrl(state({ categoryHasChildren: false, categoryPath: [] })),
    )

    expect(built).not.toContain('catHasChildren')
  })
})

describe('newSearch', () => {
  // Filters were picked from another query's facets; carrying them over would
  // narrow the new results by ids that may not appear in them at all.
  it('starts with no filters and on the first page', () => {
    const fresh = newSearch({ query: 'brake pads', mode: SearchMode.Generic })

    expect(hasActiveFilters(fresh)).toBe(false)
    expect(fresh.page).toBe(1)
  })
})

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

describe('mutations', () => {
  describe('withPage', () => {
    it('sets the page', () => {
      expect(withPage(state(), 4).page).toBe(4)
    })

    it('never goes below the first page', () => {
      expect(withPage(state(), 0).page).toBe(1)
    })

    it('leaves the filters untouched', () => {
      const narrowed = state({ brandIds: ['268'] })

      expect(withPage(narrowed, 2).brandIds).toEqual(['268'])
    })
  })

  describe('withMode', () => {
    it('switches the mode', () => {
      expect(withMode(state(), SearchMode.Generic).mode).toBe(SearchMode.Generic)
    })

    // A different mode is a different result set, so every facet id the
    // filters were picked from may no longer exist.
    it('drops every filter', () => {
      const narrowed = state({
        brandIds: ['268'],
        categoryPath: ['1052'],
        attributes: [{ criteriaId: '20', value: '106.4' }],
      })

      expect(hasActiveFilters(withMode(narrowed, SearchMode.Generic))).toBe(false)
    })
  })

  describe('toggleBrand', () => {
    it('adds an unselected brand', () => {
      expect(toggleBrand(state(), '268').brandIds).toEqual(['268'])
    })

    it('removes a selected brand', () => {
      const narrowed = state({ brandIds: ['268', '30'] })

      expect(toggleBrand(narrowed, '268').brandIds).toEqual(['30'])
    })

    // A narrower search has fewer pages; keeping the page number would land
    // the visitor past the end of the new result set.
    it('returns to the first page', () => {
      expect(toggleBrand(state({ page: 5 }), '268').page).toBe(1)
    })

    it('clears every brand at once', () => {
      expect(clearBrands(state({ brandIds: ['268', '30'] })).brandIds).toEqual([])
    })
  })

  describe('product type', () => {
    it('descends into a product type', () => {
      expect(selectProductType(state(), '7').productTypeId).toBe('7')
    })

    // It is a drill level, not a facet: picking another replaces the first
    // rather than widening the search to both.
    it('replaces the one already selected', () => {
      const narrowed = state({ productTypeId: '7' })

      expect(selectProductType(narrowed, '9').productTypeId).toBe('9')
    })

    it('returns to the first page', () => {
      expect(selectProductType(state({ page: 5 }), '7').page).toBe(1)
    })

    // TecDoc defines criteria per product type, so the dimensions on offer
    // belong to the set being left — carrying them over would silently narrow
    // the new one by a criterion it may not even have.
    it('drops the attribute selections', () => {
      const narrowed = state({
        productTypeId: '7',
        attributes: [{ criteriaId: '20', value: '106.4' }],
      })

      expect(selectProductType(narrowed, '9').attributes).toEqual([])
    })

    it('steps back out of the product type and its attributes', () => {
      const cleared = clearProductType(
        state({
          productTypeId: '7',
          attributes: [{ criteriaId: '20', value: '106.4' }],
        }),
      )

      expect(cleared.productTypeId).toBeUndefined()
      expect(cleared.attributes).toEqual([])
    })

    // Stepping out of the type must not also step out of the assembly group
    // that contains it — that is the next click up, not this one.
    it('keeps the category path when stepping out', () => {
      const cleared = clearProductType(
        state({ categoryPath: ['100', '1052'], productTypeId: '7' }),
      )

      expect(cleared.categoryPath).toEqual(['100', '1052'])
    })
  })

  describe('category drill-down', () => {
    it('appends the node and records whether it is a leaf', () => {
      const drilled = drillIntoCategory(state({ categoryPath: ['100'] }), {
        id: '1052',
        hasChildren: false,
      })

      expect(drilled.categoryPath).toEqual(['100', '1052'])
      expect(drilled.categoryHasChildren).toBe(false)
    })

    // The new node exposes a different criteria block, so a carried-over
    // selection would silently narrow it by a criterion that is not shown.
    it('drops attribute selections when moving to another category', () => {
      const narrowed = state({
        categoryPath: ['100'],
        attributes: [{ criteriaId: '20', value: '106.4' }],
      })

      expect(
        drillIntoCategory(narrowed, { id: '1052', hasChildren: false })
          .attributes,
      ).toEqual([])
    })

    // A generic article belongs to the assembly group it was listed under, so
    // it cannot survive a move to a different one.
    it.each([
      ['drilling deeper', (s: SearchUrlState) =>
        drillIntoCategory(s, { id: '1052', hasChildren: false })],
      ['stepping up', categoryUp],
      ['clearing the path', clearCategory],
    ])('drops the product type when %s', (_name, move) => {
      const narrowed = state({
        categoryPath: ['100', '1052'],
        productTypeId: '7',
      })

      expect(move(narrowed).productTypeId).toBeUndefined()
    })

    it('steps one level back up', () => {
      const drilled = state({
        categoryPath: ['100', '1052'],
        categoryHasChildren: false,
      })

      expect(categoryUp(drilled).categoryPath).toEqual(['100'])
    })

    // We drilled through the node we are returning to, so it is a branch by
    // definition — which correctly stops the API computing dimensions for it.
    it('marks the node returned to as having children', () => {
      const drilled = state({
        categoryPath: ['100', '1052'],
        categoryHasChildren: false,
      })

      expect(categoryUp(drilled).categoryHasChildren).toBe(true)
    })

    it('clears the hint once the path is empty', () => {
      const drilled = state({ categoryPath: ['100'], categoryHasChildren: true })

      expect(categoryUp(drilled).categoryHasChildren).toBeUndefined()
    })

    it('clears the whole path at once', () => {
      const drilled = state({
        categoryPath: ['100', '1052'],
        categoryHasChildren: false,
        attributes: [{ criteriaId: '20', value: '106.4' }],
      })
      const cleared = clearCategory(drilled)

      expect(cleared.categoryPath).toEqual([])
      expect(cleared.categoryHasChildren).toBeUndefined()
      expect(cleared.attributes).toEqual([])
    })
  })

  describe('selectCategoryPath', () => {
    // The breadcrumb jumps straight to a crumb rather than stepping, and the
    // path it carries is the tree's, which may not be the one that was clicked.
    it('replaces the path outright instead of stepping', () => {
      const drilled = state({
        categoryPath: ['100256'],
        categoryHasChildren: false,
      })

      expect(
        selectCategoryPath(drilled, ['100', '100200']).categoryPath,
      ).toEqual(['100', '100200'])
    })

    it('marks the node selected as having children', () => {
      expect(
        selectCategoryPath(state(), ['100']).categoryHasChildren,
      ).toBe(true)
    })

    it('clears the hint when the path is empty', () => {
      const drilled = state({ categoryPath: ['100'], categoryHasChildren: true })

      expect(
        selectCategoryPath(drilled, []).categoryHasChildren,
      ).toBeUndefined()
    })

    it('drops the narrowings that belong to the node being left', () => {
      const drilled = state({
        categoryPath: ['100', '100200'],
        productTypeId: '7',
        attributes: [{ criteriaId: '20', value: '106.4' }],
        page: 4,
      })
      const moved = selectCategoryPath(drilled, ['100'])

      expect(moved.productTypeId).toBeUndefined()
      expect(moved.attributes).toEqual([])
      expect(moved.page).toBe(1)
    })
  })

  describe('toggleAttribute', () => {
    it('adds an unselected value', () => {
      expect(toggleAttribute(state(), '20', '106.4').attributes).toEqual([
        { criteriaId: '20', value: '106.4' },
      ])
    })

    it('removes a selected value', () => {
      const narrowed = state({
        attributes: [
          { criteriaId: '20', value: '106.4' },
          { criteriaId: '2', value: 'Отпред' },
        ],
      })

      expect(toggleAttribute(narrowed, '20', '106.4').attributes).toEqual([
        { criteriaId: '2', value: 'Отпред' },
      ])
    })

    // Two criteria can share a value string, so a match on the value alone
    // would remove the wrong selection.
    it('matches on the criterion and the value together', () => {
      const narrowed = state({ attributes: [{ criteriaId: '20', value: '30' }] })

      expect(isAttributeSelected(narrowed, '21', '30')).toBe(false)
      expect(toggleAttribute(narrowed, '21', '30').attributes).toHaveLength(2)
    })

    it('clears every attribute at once', () => {
      const narrowed = state({
        attributes: [{ criteriaId: '20', value: '106.4' }],
      })

      expect(clearAttributes(narrowed).attributes).toEqual([])
    })
  })

  describe('clearAllFilters', () => {
    it('keeps the query, the vehicle and the mode', () => {
      const narrowed = state({
        vehicleId: 'v-1',
        mode: SearchMode.Generic,
        brandIds: ['268'],
        productTypeId: '7',
        categoryPath: ['1052'],
      })
      const cleared = clearAllFilters(narrowed)

      expect(cleared.query).toBe('WL6340')
      expect(cleared.vehicleId).toBe('v-1')
      expect(cleared.mode).toBe(SearchMode.Generic)
      expect(hasActiveFilters(cleared)).toBe(false)
    })
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

describe('withVehicle', () => {
  it('scopes the search to the vehicle', () => {
    expect(withVehicle(state(), '10042').vehicleId).toBe('10042')
  })

  // The results become a different set, and the facet ids the filters were
  // picked from may not appear in it at all.
  it('drops every narrowing picked from the previous set', () => {
    const scoped = withVehicle(
      state({
        brandIds: ['268'],
        productTypeId: '7',
        categoryPath: ['100'],
        attributes: [{ criteriaId: '20', value: '106.4' }],
        stockScope: 'central',
        page: 3,
      }),
      '10042',
    )

    expect(scoped).toMatchObject({
      brandIds: [],
      productTypeId: undefined,
      categoryPath: [],
      attributes: [],
      stockScope: undefined,
      page: 1,
    })
  })

  it('keeps the query and the mode', () => {
    const scoped = withVehicle(
      state({ query: 'WL6340', mode: SearchMode.Generic }),
      '10042',
    )

    expect(scoped.query).toBe('WL6340')
    expect(scoped.mode).toBe(SearchMode.Generic)
  })
})

describe('withoutVehicle', () => {
  it('widens the search back to every vehicle', () => {
    expect(withoutVehicle(state({ vehicleId: '10042' })).vehicleId).toBeUndefined()
  })

  // Symmetric with `withVehicle`, and for the same reason: leaving the vehicle
  // replaces the result set, so the facet ids the filters were picked from may
  // not appear in the wider one at all.
  it('drops every narrowing picked from the scoped set', () => {
    const widened = withoutVehicle(
      state({
        vehicleId: '10042',
        brandIds: ['268'],
        productTypeId: '7',
        categoryPath: ['100'],
        attributes: [{ criteriaId: '20', value: '106.4' }],
        stockScope: 'central',
        page: 3,
      }),
    )

    expect(widened).toMatchObject({
      brandIds: [],
      productTypeId: undefined,
      categoryPath: [],
      attributes: [],
      stockScope: undefined,
      page: 1,
    })
  })

  it('keeps the query and the mode', () => {
    const widened = withoutVehicle(
      state({ vehicleId: '10042', query: 'WL6340', mode: SearchMode.Generic }),
    )

    expect(widened.query).toBe('WL6340')
    expect(widened.mode).toBe(SearchMode.Generic)
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

describe('toSearchRequest', () => {
  // Only the last node is a filter; the ancestors exist so the sidebar can
  // offer a way back up.
  it('sends only the deepest category node', () => {
    const request = toSearchRequest(state({ categoryPath: ['100', '1052'] }))

    expect(request.categoryNodeId).toBe('1052')
  })

  it('sends no category when none is selected', () => {
    expect(toSearchRequest(state()).categoryNodeId).toBeUndefined()
  })

  it('carries the page, mode and every filter through', () => {
    const request = toSearchRequest(
      state({
        page: 2,
        mode: SearchMode.Generic,
        brandIds: ['268'],
        productTypeId: '7',
        categoryHasChildren: false,
        attributes: [{ criteriaId: '20', value: '106.4' }],
      }),
    )

    expect(request).toMatchObject({
      query: 'WL6340',
      page: 2,
      mode: SearchMode.Generic,
      brandIds: ['268'],
      productTypeIds: ['7'],
      categoryHasChildren: false,
      attributes: [{ criteriaId: '20', value: '106.4' }],
    })
  })
})
