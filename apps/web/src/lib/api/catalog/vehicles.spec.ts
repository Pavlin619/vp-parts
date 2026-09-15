import {
  getManufacturers,
  getModelSeries,
  getVariants,
  manufacturersQueryOptions,
  modelSeriesQueryOptions,
  variantsQueryOptions,
} from './vehicles'
import { apiFetch } from '../index'

jest.mock('../index')

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
