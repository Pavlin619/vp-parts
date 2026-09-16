import {
  availabilityQueryOptions,
  getArticlesAvailability,
} from './availability'
import { apiFetch } from '../index'

jest.mock('../index')

const mockApiFetch = jest.mocked(apiFetch)

beforeEach(() => {
  mockApiFetch.mockResolvedValue([])
})

afterEach(() => {
  mockApiFetch.mockClear()
})

describe('getArticlesAvailability', () => {
  // Brand and number together: a number alone names as many parts as there are
  // suppliers filing it, and the endpoint must not have to guess which.
  it('requests the comma-joined brand:number pairs from the live endpoint', () => {
    getArticlesAvailability([
      { brandId: '268', articleNumber: 'WL6340' },
      { brandId: '72', articleNumber: 'OC115' },
    ])
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/articles-availability?articles=268%3AWL6340%2C72%3AOC115',
    )
  })

  it('short-circuits an empty request without calling the API', async () => {
    const result = await getArticlesAvailability([])
    expect(result).toEqual({})
    expect(mockApiFetch).not.toHaveBeenCalled()
  })
})

describe('availabilityQueryOptions', () => {
  const wixFilter = { brandId: '268', articleNumber: 'WL6340' }
  const mannFilter = { brandId: '72', articleNumber: 'OC115' }

  it('keys by the sorted, comma-joined articles so order never forks the cache', () => {
    expect(availabilityQueryOptions([wixFilter, mannFilter]).queryKey).toEqual([
      'catalog',
      'availability',
      '268:WL6340,72:OC115',
    ])
    // The same set in a different order shares one cache entry.
    expect(availabilityQueryOptions([mannFilter, wixFilter]).queryKey).toEqual(
      availabilityQueryOptions([wixFilter, mannFilter]).queryKey,
    )
  })

  // Two brands filing one number are two parts, so they must not share an entry.
  it('keys one number under two brands separately', () => {
    expect(availabilityQueryOptions([wixFilter]).queryKey).not.toEqual(
      availabilityQueryOptions([{ brandId: '72', articleNumber: 'WL6340' }])
        .queryKey,
    )
  })

  it('sets a browse-time staleTime', () => {
    expect(availabilityQueryOptions([wixFilter]).staleTime).toBe(30_000)
  })

  it('queryFn requests the live availability for the articles', () => {
    availabilityQueryOptions([wixFilter, mannFilter]).queryFn?.({} as never)
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/articles-availability?articles=268%3AWL6340%2C72%3AOC115',
    )
  })
})
