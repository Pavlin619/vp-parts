import { SearchMode } from '@vp-parts-shop/shared'
import { hasActiveFilters, newSearch } from './index'

describe('newSearch', () => {
  // Filters were picked from another query's facets; carrying them over would
  // narrow the new results by ids that may not appear in them at all.
  it('starts with no filters and on the first page', () => {
    const fresh = newSearch({ query: 'brake pads', mode: SearchMode.Generic })

    expect(hasActiveFilters(fresh)).toBe(false)
    expect(fresh.page).toBe(1)
  })
})
