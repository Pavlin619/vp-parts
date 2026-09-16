import {
  getPartNumbers,
  partNumbersQueryOptions,
} from './part-numbers'
import { apiFetch } from '../index'

jest.mock('../index')

const mockApiFetch = jest.mocked(apiFetch)

beforeEach(() => {
  mockApiFetch.mockResolvedValue([])
})

afterEach(() => {
  mockApiFetch.mockClear()
})

describe('getPartNumbers', () => {
  it('calls the brand-scoped part-numbers endpoint', () => {
    getPartNumbers('94', 'OX 982D')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/OX%20982D/part-numbers',
    )
  })

  it('URL-encodes special characters in the article number', () => {
    getPartNumbers('94', 'ABC/123')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/ABC%2F123/part-numbers',
    )
  })
})

describe('partNumbersQueryOptions', () => {
  it('keys by the brand and the article number', () => {
    expect(partNumbersQueryOptions('94', 'OX 982D').queryKey).toEqual([
      'catalog',
      'part-numbers',
      '94',
      'OX 982D',
    ])
  })

  // Nothing in the payload is price-bearing, so reopening the section on
  // another row for the same part must not refetch.
  it('survives a collapsed section as long as it stays fresh', () => {
    const options = partNumbersQueryOptions('94', 'OX 982D')

    expect(options.staleTime).toBe(60 * 60 * 1000)
    expect(options.gcTime).toBe(options.staleTime)
  })
})
