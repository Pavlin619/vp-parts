import { headers } from 'next/headers'
import { searchByPartNumber } from './search'
import { apiFetch } from './index'

jest.mock('./index')
jest.mock('next/headers')

const mockApiFetch = jest.mocked(apiFetch)
const mockHeaders = jest.mocked(headers)

const WEB_ORIGIN_TOKEN = 'web-origin-secret'
const VISITOR_IP = '203.0.113.7'

function incomingRequest(entries: Record<string, string> = {}) {
  mockHeaders.mockResolvedValue(
    new Headers(entries) as unknown as Awaited<ReturnType<typeof headers>>,
  )
}

/** The options `apiFetch` was called with, or `undefined` for a bare call. */
function requestOptions() {
  return mockApiFetch.mock.calls[0]?.[1]
}

beforeEach(() => {
  process.env.WEB_ORIGIN_TOKEN = WEB_ORIGIN_TOKEN
  mockApiFetch.mockResolvedValue({})
  incomingRequest({ 'x-forwarded-for': VISITOR_IP })
})

afterEach(() => {
  delete process.env.WEB_ORIGIN_TOKEN
  jest.clearAllMocks()
})

describe('searchByPartNumber', () => {
  it('calls /search with the URL-encoded query', async () => {
    await searchByPartNumber('WL-6340 WIX')

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/search?q=WL-6340+WIX',
      expect.anything(),
    )
  })

  it('includes the vehicleId query param when provided', async () => {
    await searchByPartNumber('WL6340', 'v-789')

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/search?q=WL6340&vehicleId=v-789',
      expect.anything(),
    )
  })

  describe('client attribution', () => {
    it("forwards the visitor's address with the token that vouches for it", async () => {
      await searchByPartNumber('WL6340')

      expect(requestOptions()?.headers).toEqual({
        'x-forwarded-for': VISITOR_IP,
        'x-web-origin-token': WEB_ORIGIN_TOKEN,
      })
    })

    it('forwards the whole chain so the API can pick the originating address', async () => {
      incomingRequest({ 'x-forwarded-for': `${VISITOR_IP}, 198.51.100.2` })

      await searchByPartNumber('WL6340')

      expect(requestOptions()?.headers).toMatchObject({
        'x-forwarded-for': `${VISITOR_IP}, 198.51.100.2`,
      })
    })

    it('claims nothing when no token is configured', async () => {
      // The API ignores an unvouched-for address anyway.
      delete process.env.WEB_ORIGIN_TOKEN

      await searchByPartNumber('WL6340')

      expect(requestOptions()?.headers).toEqual({})
    })

    it('claims nothing when the incoming request has no forwarded address', async () => {
      incomingRequest()

      await searchByPartNumber('WL6340')

      expect(requestOptions()?.headers).toEqual({})
    })
  })
})
