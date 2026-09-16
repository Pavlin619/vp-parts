import { SearchMode } from '@vp-parts-shop/shared'
import {
  categoryUp,
  clearAllFilters,
  clearAttributes,
  clearBrands,
  clearCategory,
  clearProductType,
  drillIntoCategory,
  FIRST_PAGE,
  hasActiveFilters,
  isAttributeSelected,
  selectCategoryPath,
  selectProductType,
  toggleAttribute,
  toggleAttributeGroup,
  toggleBrand,
  withMode,
  withoutVehicle,
  withPage,
  withVehicle,
  type SearchUrlState,
} from './index'
import { state } from './fixtures'

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

    describe('toggleAttributeGroup', () => {
      it('applies every value of the group in one step', () => {
        expect(
          toggleAttributeGroup(state(), '100', ['VL', 'LV']).attributes,
        ).toEqual([
          { criteriaId: '100', value: 'VL' },
          { criteriaId: '100', value: 'LV' },
        ])
      })

      // Half-selected is the state a per-value toggle would leave behind, and
      // it has no meaning on a diagram: the zone is either narrowing or not.
      it('clears the whole group when only part of it is applied', () => {
        const narrowed = state({
          attributes: [{ criteriaId: '100', value: 'LV' }],
        })

        expect(
          toggleAttributeGroup(narrowed, '100', ['VL', 'LV']).attributes,
        ).toEqual([])
      })

      it('leaves the same value under another criterion alone', () => {
        const narrowed = state({
          attributes: [{ criteriaId: '273', value: 'VL' }],
        })

        expect(
          toggleAttributeGroup(narrowed, '100', ['VL']).attributes,
        ).toEqual([
          { criteriaId: '273', value: 'VL' },
          { criteriaId: '100', value: 'VL' },
        ])
      })

      it('returns to the first page, like every other narrowing', () => {
        expect(
          toggleAttributeGroup(state({ page: 4 }), '100', ['VA']).page,
        ).toBe(FIRST_PAGE)
      })
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
