import { SearchMode } from '@vp-parts-shop/shared'
import {
  autocompleteQueryOptions,
  getAutocomplete,
} from './autocomplete'
import { apiFetch } from '../index'

jest.mock('../index')

const mockApiFetch = jest.mocked(apiFetch)

beforeEach(() => {
  mockApiFetch.mockResolvedValue([])
})

afterEach(() => {
  mockApiFetch.mockClear()
})

describe('getAutocomplete', () => {
  it('calls /search/autocomplete with the URL-encoded query', () => {
    getAutocomplete('WL6')
    expect(mockApiFetch).toHaveBeenCalledWith('/search/autocomplete?q=WL6')
  })
})

describe('autocompleteQueryOptions', () => {
  it('has the correct query key for a given query', () => {
    expect(autocompleteQueryOptions('WL6').queryKey).toEqual([
      'catalog',
      'autocomplete',
      'part_number',
      'WL6',
    ])
  })

  it('produces a different query key for a different query', () => {
    expect(autocompleteQueryOptions('WL63').queryKey).not.toEqual(
      autocompleteQueryOptions('WL6').queryKey,
    )
  })

  // The same term yields different suggestions per mode — articles for a
  // number search, free-text terms for a generic one — so one shared entry
  // would serve article rows to a descriptive search and vice versa.
  it('keys each search mode separately', () => {
    expect(
      autocompleteQueryOptions('WL6', SearchMode.Generic).queryKey,
    ).not.toEqual(autocompleteQueryOptions('WL6', SearchMode.PartNumber).queryKey)
  })
})
