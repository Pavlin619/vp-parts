import { categorySearchHref } from './category-href'
import type { CategoryTreeNode } from './category-tree'
import { hasSearchSubject, parseSearchUrl } from './search-url'

function node(
  id: string,
  children: CategoryTreeNode[] = [],
): CategoryTreeNode {
  return {
    category: { id, name: id, parentId: null, articleCount: 1, sortNo: 1 },
    children,
  }
}

const OIL_FILTERS = node('100259')
const FILTERS = node('100005', [OIL_FILTERS])

/** The state the search page would parse back out of the href. */
const stateFor = (href: string) =>
  parseSearchUrl(new URLSearchParams(href.split('?')[1]))

describe('categorySearchHref', () => {
  it('scopes the search to the car and the whole drilled path', () => {
    const state = stateFor(categorySearchHref('13074', [FILTERS, OIL_FILTERS]))

    expect(state.vehicleId).toBe('13074')
    expect(state.categoryPath).toEqual(['100005', '100259'])
    expect(state.query).toBe('')
  })

  // A browse types nothing, so the vehicle and the category are the whole
  // subject — the search page renders results rather than its empty state.
  it('is a search the page accepts with nothing typed', () => {
    expect(hasSearchSubject(stateFor(categorySearchHref('13074', [FILTERS])))).toBe(
      true,
    )
  })

  // The flag is what decides whether the API computes the dimension facets,
  // and it is read off the last node of the path.
  it('reports a leaf as having no children and a group as having them', () => {
    expect(
      stateFor(categorySearchHref('13074', [FILTERS, OIL_FILTERS]))
        .categoryHasChildren,
    ).toBe(false)
    expect(
      stateFor(categorySearchHref('13074', [FILTERS])).categoryHasChildren,
    ).toBe(true)
  })

  it('carries no filters over from anywhere', () => {
    const state = stateFor(categorySearchHref('13074', [FILTERS]))

    expect(state.brandIds).toEqual([])
    expect(state.attributes).toEqual([])
    expect(state.productTypeId).toBeUndefined()
    expect(state.page).toBe(1)
  })
})

/**
 * The catalogue is browsable with no car picked, so the same links have to lead
 * somewhere without one. The category alone is a subject the API accepts, and
 * the search page then offers the narrowing in its own sidebar.
 */
describe('categorySearchHref — with no car picked', () => {
  it('scopes the search to the path alone', () => {
    const state = stateFor(categorySearchHref(undefined, [FILTERS, OIL_FILTERS]))

    expect(state.vehicleId).toBeUndefined()
    expect(state.categoryPath).toEqual(['100005', '100259'])
  })

  it('is still a search the page accepts with nothing typed', () => {
    expect(
      hasSearchSubject(stateFor(categorySearchHref(undefined, [FILTERS]))),
    ).toBe(true)
  })

  it('leaves the vehicle out of the URL rather than sending an empty one', () => {
    expect(categorySearchHref(undefined, [FILTERS])).not.toContain('vehicleId')
  })
})
