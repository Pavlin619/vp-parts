import { SearchMode } from '@vp-parts-shop/shared'
import {
  looksLikeDescription,
  looksLikePartNumber,
  resolveSearchMode,
  scopeForSearchMode,
  useSearchModeStore,
} from './use-search-mode'

beforeEach(() => {
  useSearchModeStore.setState(useSearchModeStore.getInitialState())
})

describe('useSearchModeStore', () => {
  // Read from the initial state rather than the current one, so the assertion
  // is about the store's default and not about whatever the reset above set.
  it('preselects the number scope with exact off', () => {
    const state = useSearchModeStore.getInitialState()

    expect(state.scope).toBe('part')
    expect(state.isExact).toBe(false)
  })

  it('sets the scope', () => {
    useSearchModeStore.getState().setScope('generic')

    expect(useSearchModeStore.getState().scope).toBe('generic')
  })

  it('toggles the exact switch', () => {
    useSearchModeStore.getState().toggleExact()

    expect(useSearchModeStore.getState().isExact).toBe(true)
  })
})

describe('resolveSearchMode', () => {
  it('maps the number scope to the part-number lane', () => {
    expect(resolveSearchMode('part', false)).toBe(SearchMode.PartNumber)
  })

  it('maps the number scope with exact on to the exact lane', () => {
    expect(resolveSearchMode('part', true)).toBe(SearchMode.PartNumberExact)
  })

  it('maps the descriptive scope to free text', () => {
    expect(resolveSearchMode('generic', false)).toBe(SearchMode.Generic)
  })

  // "Exact" qualifies how a *number* is matched; there is no generic+exact mode
  // on the API, so the switch must not leak into a free-text search.
  it('ignores the exact switch in the descriptive scope', () => {
    expect(resolveSearchMode('generic', true)).toBe(SearchMode.Generic)
  })
})

describe('scopeForSearchMode', () => {
  it.each([
    [SearchMode.PartNumber, 'part'],
    [SearchMode.PartNumberExact, 'part'],
    [SearchMode.Generic, 'generic'],
  ])('maps %s back to the %s scope', (mode, scope) => {
    expect(scopeForSearchMode(mode)).toBe(scope)
  })
})

describe('looksLikePartNumber', () => {
  it.each(['13717521033', 'WL-6340', 'F 026 400 237', 'ADG02205'])(
    'recognises %s',
    (candidate) => {
      expect(looksLikePartNumber(candidate)).toBe(true)
    },
  )

  it.each([
    ['въздушен филтър', 'Cyrillic is always prose'],
    ['oil filter bosch', 'no digits'],
    ['WL63', 'too few alphanumerics'],
    ['abc', 'too short'],
    ['brake pads for bmw 320d', 'too many words'],
    ['', 'empty'],
  ])('rejects %s (%s)', (candidate) => {
    expect(looksLikePartNumber(candidate)).toBe(false)
  })

  // It only ever offers a suggestion, so being loose costs a line of UI while
  // being strict costs a search that returns nothing and explains nothing.
  it('accepts a brand-suffixed number, which the API strips anyway', () => {
    expect(looksLikePartNumber('WL6340 WIX')).toBe(true)
  })
})

describe('looksLikeDescription', () => {
  it.each([
    ['въздушен филтър', 'Cyrillic'],
    ['oil filter', 'no digits'],
    ['BOSCH', 'a bare brand the number lane cannot answer'],
    ['спирачни накладки предни', 'Cyrillic with several words'],
  ])('recognises %s (%s)', (candidate) => {
    expect(looksLikeDescription(candidate)).toBe(true)
  })

  it.each([
    ['13717521033', 'a plain number'],
    ['WL-6340', 'an alphanumeric number'],
    ['F 026 400 237', 'a spaced Bosch number'],
    ['oil', 'too short to judge'],
    ['', 'empty'],
  ])('rejects %s (%s)', (candidate) => {
    expect(looksLikeDescription(candidate)).toBe(false)
  })
})

// The search bar picks at most one hint from the pair, so an overlap would make
// the offer depend on which branch happens to be checked first.
describe('the two hint predicates', () => {
  it.each([
    'въздушен филтър',
    'oil filter bosch',
    '13717521033',
    'WL-6340',
    'BOSCH',
    'abc',
    '',
  ])('never both hold for %s', (candidate) => {
    const isBoth =
      looksLikePartNumber(candidate) && looksLikeDescription(candidate)

    expect(isBoth).toBe(false)
  })
})
