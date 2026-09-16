import {
  categoriesQueryOptions,
  getCategories,
} from './categories'
import { apiFetch } from '../index'

jest.mock('../index')

const mockApiFetch = jest.mocked(apiFetch)

beforeEach(() => {
  mockApiFetch.mockResolvedValue([])
})

afterEach(() => {
  mockApiFetch.mockClear()
})

describe('getCategories', () => {
  it('calls the correct URL with the vehicle ID', () => {
    getCategories('vehicle-789')
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/catalog/vehicles/vehicle-789/categories',
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

  // No car is a tree of its own — the whole catalogue's — so it gets its own
  // entry rather than sharing one with a car's subset.
  it('keys the catalogue-wide tree apart from every car', () => {
    expect(categoriesQueryOptions().queryKey).toEqual([
      'catalog',
      'categories',
      'catalogue',
    ])
  })

  it('reads the car tree with a vehicle and the catalogue tree without one', async () => {
    await categoriesQueryOptions('v-1').queryFn!({} as never)
    expect(mockApiFetch).toHaveBeenCalledWith('/catalog/vehicles/v-1/categories')

    await categoriesQueryOptions().queryFn!({} as never)
    expect(mockApiFetch).toHaveBeenCalledWith('/catalog/categories')
  })
})
