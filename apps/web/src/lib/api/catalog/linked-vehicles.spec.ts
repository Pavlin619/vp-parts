import {
  getLinkedManufacturers,
  getLinkedVehiclesByManufacturer,
  linkedManufacturersQueryOptions,
  linkedVehiclesByMakeQueryOptions,
} from './linked-vehicles'
import { apiFetch } from '../index'

jest.mock('../index')

const mockApiFetch = jest.mocked(apiFetch)

beforeEach(() => {
  mockApiFetch.mockResolvedValue([])
})

afterEach(() => {
  mockApiFetch.mockClear()
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
