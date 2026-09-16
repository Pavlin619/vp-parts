import { SearchMode, type AutocompleteItemDto } from '@vp-parts-shop/shared'
import { suggestionHref } from './suggestion-href'

interface Context {
  mode: SearchMode
}

const PART_NUMBER_CONTEXT: Context = { mode: SearchMode.PartNumber }

/** The built href with its query string decoded, for readable assertions. */
function href(suggestion: AutocompleteItemDto, context = PART_NUMBER_CONTEXT) {
  return decodeURIComponent(suggestionHref(suggestion, context))
}

describe('suggestionHref', () => {
  describe('article suggestions', () => {
    const article: AutocompleteItemDto = {
      kind: 'article',
      articleNumber: 'WL6340',
      brandId: '268',
      brandName: 'WIX',
      description: 'Oil Filter',
      thumbnailUrl: null,
    }

    // The suggestion already identified one part, so re-running a search for it
    // would only make the visitor pick it a second time.
    it('deep-links the part rather than searching for it', () => {
      expect(href(article)).toBe('/catalog/articles/268/WL6340')
    })

    // Two brands can file one number, so the brand has to be in the link.
    it('carries the brand that identifies the number', () => {
      expect(
        href({ ...article, brandId: '30', articleNumber: 'WL6340' }),
      ).toBe('/catalog/articles/30/WL6340')
    })
  })

  describe('term suggestions', () => {
    const term: AutocompleteItemDto = { kind: 'term', term: 'маслен филтър' }

    // A term is a description, so it can only match in the free-text lane —
    // whatever the box happened to be set to when it was suggested.
    it('always runs the term as a free-text search', () => {
      expect(href(term)).toBe('/search?q=маслен+филтър&mode=generic')
    })

    // A saved vehicle scopes a search only where the visitor asked it to, on
    // the results page. Following a suggestion is not that ask.
    it('leaves the search unscoped by any vehicle', () => {
      expect(href(term)).not.toContain('vehicleId')
    })
  })

  describe('category suggestions', () => {
    const category: AutocompleteItemDto = {
      kind: 'category',
      term: 'WL6340',
      categoryNodeId: '1052',
      label: 'Маслен филтър',
      count: 12,
    }

    it('re-runs the typed term narrowed to that category', () => {
      expect(href(category)).toContain('q=WL6340')
      expect(href(category)).toContain('cat=1052')
    })

    // The API only ever suggests leaf categories, and saying so is what unlocks
    // the dimension facets on the search that follows.
    it('marks the category as a leaf so the dimensions are computed', () => {
      expect(href(category)).toContain('catHasChildren=false')
    })

    it('keeps the mode the search box was in', () => {
      expect(href(category, { mode: SearchMode.Generic })).toContain(
        'mode=generic',
      )
    })
  })
})
