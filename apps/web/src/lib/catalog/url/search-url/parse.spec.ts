import { SearchMode } from '@vp-parts-shop/shared'
import { parseSearchUrl, selectedCategoryId } from './index'

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
