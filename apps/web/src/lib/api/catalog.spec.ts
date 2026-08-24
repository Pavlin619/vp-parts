import { SearchMode } from '@vp-parts-shop/shared'
import {
  getManufacturers,
  getModelSeries,
  getVariants,
  getCategories,
  getArticlesMetadata,
  getArticlesAvailability,
  getArticleCatalogDetail,
  getSubstitutes,
  getLinkedManufacturers,
  getLinkedVehiclesByManufacturer,
  getAlternativeNumbers,
  getAutocomplete,
  alternativeNumbersQueryOptions,
  substitutesQueryOptions,
  linkedManufacturersQueryOptions,
  linkedVehiclesByMakeQueryOptions,
  manufacturersQueryOptions,
  modelSeriesQueryOptions,
  variantsQueryOptions,
  categoriesQueryOptions,
  availabilityQueryOptions,
  autocompleteQueryOptions,
} from './catalog'
import { apiFetch } from './index'

jest.mock('./index')

const mockApiFetch = jest.mocked(apiFetch)

beforeEach(() => {
  mockApiFetch.mockResolvedValue([])
})

afterEach(() => {
  mockApiFetch.mockClear()
})

describe('getManufacturers', () => {
  it('calls /catalog/manufacturers', () => {
    getManufacturers()
    expect(mockApiFetch).toHaveBeenCalledWith('/catalog/manufacturers')
  })
})

describe('getModelSeries', () => {
  it('calls the correct URL with the manufacturer ID', () => {
    getModelSeries('make-123')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/manufacturers/make-123/model-series',
    )
  })
})

describe('getVariants', () => {
  it('calls the correct URL with the series ID', () => {
    getVariants('series-456')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/model-series/series-456/variants',
    )
  })
})

describe('getCategories', () => {
  it('calls the correct URL with the vehicle ID', () => {
    getCategories('vehicle-789')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/vehicles/vehicle-789/categories',
    )
  })
})

describe('getArticlesMetadata', () => {
  it('builds URL with default page and pageSize', () => {
    getArticlesMetadata('v-1', 'cat-1')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/vehicles/v-1/categories/cat-1/articles?page=1&pageSize=20',
    )
  })

  it('builds URL with explicit page and pageSize', () => {
    getArticlesMetadata('v-1', 'cat-1', 3, 50)
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/vehicles/v-1/categories/cat-1/articles?page=3&pageSize=50',
    )
  })
})

describe('getArticlesAvailability', () => {
  it('requests the comma-joined numbers from the live endpoint', () => {
    getArticlesAvailability(['WL6340', 'OC115'])
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/articles-availability?numbers=WL6340%2COC115',
    )
  })

  it('short-circuits an empty request without calling the API', async () => {
    const result = await getArticlesAvailability([])
    expect(result).toEqual({})
    expect(mockApiFetch).not.toHaveBeenCalled()
  })
})

describe('getArticleCatalogDetail', () => {
  // The number alone is not an identity — two TecDoc data suppliers can file
  // the same one — so the brand is part of the path, not an optional filter.
  it('requests the brand-scoped metadata endpoint without a query when no vehicleId is given', () => {
    getArticleCatalogDetail('30', 'ABC-123')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/30/articles/ABC-123',
    )
  })

  it('forwards the vehicleId so fitsVehicle is vehicle-scoped', () => {
    getArticleCatalogDetail('30', 'ABC-123', 'v-789')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/30/articles/ABC-123?vehicleId=v-789',
    )
  })

  it('URL-encodes special characters in the article number', () => {
    getArticleCatalogDetail('30', 'ABC/123 XYZ')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/30/articles/ABC%2F123%20XYZ',
    )
  })
})

describe('getSubstitutes', () => {
  it('asks the brand-scoped substitutes endpoint for the first page', () => {
    getSubstitutes('94', 'OX 982D')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/OX%20982D/substitutes?page=1&pageSize=20',
    )
  })

  it('asks for a later page when one is requested', () => {
    getSubstitutes('94', 'OX 982D', 3)
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
})

describe('getLinkedManufacturers', () => {
  it('calls the brand-scoped manufacturers endpoint', () => {
    getLinkedManufacturers('94', 'OX 982D')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/OX%20982D/linked-vehicles/manufacturers',
    )
  })

  it('URL-encodes special characters in the article number', () => {
    getLinkedManufacturers('94', 'ABC/123')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/ABC%2F123/linked-vehicles/manufacturers',
    )
  })
})

describe('getLinkedVehiclesByManufacturer', () => {
  it('narrows the vehicles endpoint to one make', () => {
    getLinkedVehiclesByManufacturer('94', 'OX 982D', '5')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/OX%20982D/linked-vehicles?manufacturerId=5',
    )
  })
})

describe('getAlternativeNumbers', () => {
  it('calls the brand-scoped alternative-numbers endpoint', () => {
    getAlternativeNumbers('94', 'OX 982D')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/OX%20982D/alternative-numbers',
    )
  })

  it('URL-encodes special characters in the article number', () => {
    getAlternativeNumbers('94', 'ABC/123')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/ABC%2F123/alternative-numbers',
    )
  })
})

describe('linkedManufacturersQueryOptions', () => {
  it('keys by the brand and the article number', () => {
    expect(linkedManufacturersQueryOptions('94', 'OX 982D').queryKey).toEqual([
      'catalog',
      'linked-manufacturers',
      '94',
      'OX 982D',
    ])
  })

  // Two brands filing one number are two parts with two different vehicle
  // lists; a shared key would serve one part's vehicles for the other.
  it('does not share a cache entry between two brands of one number', () => {
    expect(
      linkedManufacturersQueryOptions('30', 'OX 982D').queryKey,
    ).not.toEqual(linkedManufacturersQueryOptions('94', 'OX 982D').queryKey)
  })

  // The section unmounts the moment it is collapsed, so the app-wide
  // five-minute gcTime would drop the answer long before it went stale and a
  // reopened make would refetch.
  it('survives a collapsed section as long as it stays fresh', () => {
    const options = linkedManufacturersQueryOptions('94', 'OX 982D')

    expect(options.staleTime).toBe(60 * 60 * 1000)
    expect(options.gcTime).toBe(options.staleTime)
  })
})

describe('linkedVehiclesByMakeQueryOptions', () => {
  it('keys per make on top of the article key', () => {
    expect(linkedVehiclesByMakeQueryOptions('94', 'OX 982D', '5').queryKey).toEqual(
      ['catalog', 'linked-vehicles', '94', 'OX 982D', '5'],
    )
  })

  it('survives a collapsed make as long as it stays fresh', () => {
    const options = linkedVehiclesByMakeQueryOptions('94', 'OX 982D', '5')

    expect(options.staleTime).toBe(60 * 60 * 1000)
    expect(options.gcTime).toBe(options.staleTime)
  })
})

describe('alternativeNumbersQueryOptions', () => {
  it('keys by the brand and the article number', () => {
    expect(alternativeNumbersQueryOptions('94', 'OX 982D').queryKey).toEqual([
      'catalog',
      'alternative-numbers',
      '94',
      'OX 982D',
    ])
  })

  // Nothing in the payload is price-bearing, so reopening the section on
  // another row for the same part must not refetch.
  it('survives a collapsed section as long as it stays fresh', () => {
    const options = alternativeNumbersQueryOptions('94', 'OX 982D')

    expect(options.staleTime).toBe(60 * 60 * 1000)
    expect(options.gcTime).toBe(options.staleTime)
  })
})

describe('substitutesQueryOptions', () => {
  it('keys by the brand and the article number', () => {
    expect(substitutesQueryOptions('94', 'OX 982D').queryKey).toEqual([
      'catalog',
      'substitutes',
      '94',
      'OX 982D',
    ])
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

describe('getAutocomplete', () => {
  it('calls /search/autocomplete with the URL-encoded query', () => {
    getAutocomplete('WL6')
    expect(mockApiFetch).toHaveBeenCalledWith('/search/autocomplete?q=WL6')
  })
})

describe('manufacturersQueryOptions', () => {
  it('has the correct query key', () => {
    expect(manufacturersQueryOptions.queryKey).toEqual(['catalog', 'manufacturers'])
  })

  it('queryFn references getManufacturers', () => {
    expect(manufacturersQueryOptions.queryFn).toBe(getManufacturers)
  })
})

describe('modelSeriesQueryOptions', () => {
  it('has the correct query key for a given manufacturer ID', () => {
    expect(modelSeriesQueryOptions('make-123').queryKey).toEqual([
      'catalog',
      'model-series',
      'make-123',
    ])
  })

  it('produces a different query key for a different manufacturer ID', () => {
    expect(modelSeriesQueryOptions('make-456').queryKey).not.toEqual(
      modelSeriesQueryOptions('make-123').queryKey,
    )
  })
})

describe('variantsQueryOptions', () => {
  it('has the correct query key for a given series ID', () => {
    expect(variantsQueryOptions('series-456').queryKey).toEqual([
      'catalog',
      'variants',
      'series-456',
    ])
  })

  it('produces a different query key for a different series ID', () => {
    expect(variantsQueryOptions('series-789').queryKey).not.toEqual(
      variantsQueryOptions('series-456').queryKey,
    )
  })
})

describe('categoriesQueryOptions', () => {
  it('has the correct query key for a given vehicle ID', () => {
    expect(categoriesQueryOptions('v-1').queryKey).toEqual([
      'catalog',
      'categories',
      'v-1',
    ])
  })

  it('produces a different query key for a different vehicle ID', () => {
    expect(categoriesQueryOptions('v-2').queryKey).not.toEqual(
      categoriesQueryOptions('v-1').queryKey,
    )
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

describe('availabilityQueryOptions', () => {
  it('keys by the sorted, comma-joined numbers so order never forks the cache', () => {
    expect(availabilityQueryOptions(['WL6340', 'OC115']).queryKey).toEqual([
      'catalog',
      'availability',
      'OC115,WL6340',
    ])
    // The same set in a different order shares one cache entry.
    expect(availabilityQueryOptions(['OC115', 'WL6340']).queryKey).toEqual(
      availabilityQueryOptions(['WL6340', 'OC115']).queryKey,
    )
  })

  it('sets a browse-time staleTime', () => {
    expect(availabilityQueryOptions(['WL6340']).staleTime).toBe(30_000)
  })

  it('queryFn requests the live availability for the numbers', () => {
    availabilityQueryOptions(['WL6340', 'OC115']).queryFn?.({} as never)
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/articles-availability?numbers=WL6340%2COC115',
    )
  })
})
