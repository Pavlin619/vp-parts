import {
  getArticleCatalogDetail,
} from './articles'
import { apiFetch } from '../index'

jest.mock('../index')

const mockApiFetch = jest.mocked(apiFetch)

beforeEach(() => {
  mockApiFetch.mockResolvedValue([])
})

afterEach(() => {
  mockApiFetch.mockClear()
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
