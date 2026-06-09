import {
  getManufacturers,
  getModelSeries,
  getVariants,
  getCategories,
  listArticles,
  getArticleDetail,
  manufacturersQueryOptions,
  modelSeriesQueryOptions,
  variantsQueryOptions,
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

describe('listArticles', () => {
  it('builds URL with default page and pageSize', () => {
    listArticles('v-1', 'cat-1')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/vehicles/v-1/categories/cat-1/articles?page=1&pageSize=20',
    )
  })

  it('builds URL with explicit page and pageSize', () => {
    listArticles('v-1', 'cat-1', 3, 50)
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/vehicles/v-1/categories/cat-1/articles?page=3&pageSize=50',
    )
  })
})

describe('getArticleDetail', () => {
  it('omits the vehicleId query param when not provided', () => {
    getArticleDetail('ABC-123')
    expect(mockApiFetch).toHaveBeenCalledWith('/catalog/articles/ABC-123')
  })

  it('includes the vehicleId query param when provided', () => {
    getArticleDetail('ABC-123', 'v-789')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/articles/ABC-123?vehicleId=v-789',
    )
  })

  it('URL-encodes special characters in the article number', () => {
    getArticleDetail('ABC/123 XYZ')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/articles/ABC%2F123%20XYZ',
    )
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
