import { DEFAULT_SEARCH_SORT, SearchSort } from '@vp-parts-shop/shared'
import {
  getSubstitutes,
  substitutesQueryOptions,
} from './substitutes'
import { apiFetch } from '../index'

jest.mock('../index')

const mockApiFetch = jest.mocked(apiFetch)

beforeEach(() => {
  mockApiFetch.mockResolvedValue([])
})

afterEach(() => {
  mockApiFetch.mockClear()
})

describe('getSubstitutes', () => {
  it('asks the brand-scoped substitutes endpoint for the first page', () => {
    getSubstitutes('94', 'OX 982D')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/OX%20982D/substitutes?page=1&pageSize=20',
    )
  })

  it('asks for a later page when one is requested', () => {
    getSubstitutes('94', 'OX 982D', { page: 3 })
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/OX%20982D/substitutes?page=3&pageSize=20',
    )
  })

  // Each page is priced by one availability read of its own numbers, and that
  // endpoint takes at most 50 at a time.
  it('asks for no more rows than one availability batch can price', () => {
    getSubstitutes('94', 'OX 982D')

    const [url] = mockApiFetch.mock.calls[0] as [string]
    const pageSize = Number(new URL(url, 'https://api.test').searchParams.get('pageSize'))

    expect(pageSize).toBeLessThanOrEqual(50)
  })

  it('URL-encodes special characters in the article number', () => {
    getSubstitutes('94', 'ABC/123')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/ABC%2F123/substitutes?page=1&pageSize=20',
    )
  })

  it('asks for the order the visitor chose', () => {
    getSubstitutes('94', 'OX 982D', { sort: SearchSort.PriceAscending })
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/OX%20982D/substitutes?page=1&pageSize=20&sort=price_asc',
    )
  })

  // The API's own default, so sending it would only make two spellings of one
  // request — and two cache entries for one answer.
  it('leaves the default order off the query string', () => {
    getSubstitutes('94', 'OX 982D', { sort: DEFAULT_SEARCH_SORT })
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/OX%20982D/substitutes?page=1&pageSize=20',
    )
  })
})

describe('substitutesQueryOptions', () => {
  it('keys by the brand, the article number and the order', () => {
    expect(substitutesQueryOptions('94', 'OX 982D').queryKey).toEqual([
      'catalog',
      'substitutes',
      '94',
      'OX 982D',
      DEFAULT_SEARCH_SORT,
    ])
  })

  // The sort reorders the whole set before it is paged, so pages of two sorts
  // are not pages of one list and must not accumulate in one entry.
  it('splits the cache between two orders of one set', () => {
    expect(
      substitutesQueryOptions('94', 'OX 982D', SearchSort.PriceAscending)
        .queryKey,
    ).not.toEqual(substitutesQueryOptions('94', 'OX 982D').queryKey)
  })

  // Which parts replace a part is a property of that part, so the two brands
  // filing one number have different substitutes. A shared key served one
  // brand's list to the other.
  it('splits the cache between two brands sharing a number', () => {
    expect(substitutesQueryOptions('94', 'OX 982D').queryKey).not.toEqual(
      substitutesQueryOptions('30', 'OX 982D').queryKey,
    )
  })

  it('survives a collapsed section as long as it stays fresh', () => {
    const options = substitutesQueryOptions('94', 'OX 982D')

    expect(options.staleTime).toBe(60 * 60 * 1000)
    expect(options.gcTime).toBe(options.staleTime)
  })

  it('starts at the first page', () => {
    expect(substitutesQueryOptions('94', 'OX 982D').initialPageParam).toBe(1)
  })

  it('queryFn requests the page it is given', () => {
    substitutesQueryOptions('94', 'OX 982D').queryFn?.({
      pageParam: 2,
    } as never)

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/OX%20982D/substitutes?page=2&pageSize=20',
    )
  })

  describe('getNextPageParam', () => {
    const nextAfter = (page: number, pageSize: number, total: number) =>
      substitutesQueryOptions('94', 'OX 982D').getNextPageParam(
        { total, page, pageSize, items: [] },
        [],
        page,
        [],
      )

    it('offers the page after one the set outlasts', () => {
      expect(nextAfter(1, 20, 76)).toBe(2)
    })

    // A set whose size is an exact multiple of the page size would otherwise
    // always offer one more page, and that page would come back empty.
    it('stops at the last page of an exactly-filled set', () => {
      expect(nextAfter(2, 20, 40)).toBeUndefined()
    })

    it('stops when the set fits in one page', () => {
      expect(nextAfter(1, 20, 3)).toBeUndefined()
    })
  })
})
