import { approximateLocationQueryOptions, getApproximateLocation } from './approximate-location'

const mockFetch = jest.fn()
global.fetch = mockFetch

function answer(body: unknown, ok = true) {
  mockFetch.mockResolvedValueOnce({ ok, json: () => Promise.resolve(body) })
}

beforeEach(() => mockFetch.mockReset())

describe('getApproximateLocation', () => {
  it("asks the site's own route, not the API", async () => {
    answer({ latitude: 42.15, longitude: 24.75 })

    await expect(getApproximateLocation()).resolves.toEqual({ latitude: 42.15, longitude: 24.75 })
    expect(mockFetch).toHaveBeenCalledWith('/api/approximate-location')
  })

  it('answers no location when the route knows none', async () => {
    answer(null)

    await expect(getApproximateLocation()).resolves.toBeNull()
  })

  // A guess is a convenience; failing to make one must never stop the picker.
  it('answers no location when the route fails or cannot be reached', async () => {
    answer({ statusCode: 500 }, false)
    await expect(getApproximateLocation()).resolves.toBeNull()

    mockFetch.mockRejectedValueOnce(new TypeError('offline'))
    await expect(getApproximateLocation()).resolves.toBeNull()
  })
})

describe('approximateLocationQueryOptions', () => {
  it('asks once per visit', () => {
    expect(approximateLocationQueryOptions.queryKey).toEqual(['geo', 'approximate-location'])
    expect(approximateLocationQueryOptions.staleTime).toBe(Infinity)
  })
})
