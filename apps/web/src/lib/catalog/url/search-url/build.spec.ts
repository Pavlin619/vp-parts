import { SearchMode } from '@vp-parts-shop/shared'
import { buildSearchUrl, parseSearchUrl, toSearchRequest } from './index'
import { query, state } from './fixtures'

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
