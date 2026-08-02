import {
  getManufacturers,
  getModelSeries,
  getVariants,
  getCategories,
  getArticlesMetadata,
  getArticlesAvailability,
  getArticleCatalogDetail,
  getSubstitutes,
  getLinkedVehicles,
  getAlternativeNumbers,
  getAutocomplete,
  alternativeNumbersQueryOptions,
  linkedVehiclesQueryOptions,
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
  it('calls the substitutes endpoint for the article number', () => {
    getSubstitutes('OX 982D')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/articles/OX%20982D/substitutes',
    )
  })

  it('URL-encodes special characters in the article number', () => {
    getSubstitutes('ABC/123')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/articles/ABC%2F123/substitutes',
    )
  })
})

describe('getLinkedVehicles', () => {
  it('calls the brand-scoped linked-vehicles endpoint', () => {
    getLinkedVehicles('94', 'OX 982D')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/OX%20982D/linked-vehicles',
    )
  })

  it('URL-encodes special characters in the article number', () => {
    getLinkedVehicles('94', 'ABC/123')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/brands/94/articles/ABC%2F123/linked-vehicles',
    )
  })
})

describe('getAlternativeNumbers', () => {
  it('calls the alternative-numbers endpoint for the article number', () => {
    getAlternativeNumbers('OX 982D')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/articles/OX%20982D/alternative-numbers',
    )
  })

  it('URL-encodes special characters in the article number', () => {
    getAlternativeNumbers('ABC/123')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/articles/ABC%2F123/alternative-numbers',
    )
  })
})

describe('linkedVehiclesQueryOptions', () => {
  it('keys by the brand and the article number', () => {
    expect(linkedVehiclesQueryOptions('94', 'OX 982D').queryKey).toEqual([
      'catalog',
      'linked-vehicles',
      '94',
      'OX 982D',
    ])
  })

  // Two brands filing one number are two parts with two different vehicle
  // lists; a shared key would serve one part's vehicles for the other.
  it('does not share a cache entry between two brands of one number', () => {
    expect(linkedVehiclesQueryOptions('30', 'OX 982D').queryKey).not.toEqual(
      linkedVehiclesQueryOptions('94', 'OX 982D').queryKey,
    )
  })

  it('stays fresh for an hour', () => {
    expect(linkedVehiclesQueryOptions('94', 'OX 982D').staleTime).toBe(
      60 * 60 * 1000,
    )
  })
})

describe('alternativeNumbersQueryOptions', () => {
  it('keys by the article number', () => {
    expect(alternativeNumbersQueryOptions('OX 982D').queryKey).toEqual([
      'catalog',
      'alternative-numbers',
      'OX 982D',
    ])
  })

  // Nothing in the payload is price-bearing, so reopening the section on
  // another row for the same part must not refetch.
  it('stays fresh for an hour', () => {
    expect(alternativeNumbersQueryOptions('OX 982D').staleTime).toBe(
      60 * 60 * 1000,
    )
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
      'WL6',
    ])
  })

  it('produces a different query key for a different query', () => {
    expect(autocompleteQueryOptions('WL63').queryKey).not.toEqual(
      autocompleteQueryOptions('WL6').queryKey,
    )
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
