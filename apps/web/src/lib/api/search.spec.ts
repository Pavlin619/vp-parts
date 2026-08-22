import { headers } from 'next/headers'
import { SearchMode } from '@vp-parts-shop/shared'
import { searchArticles } from './search'
import { apiFetch } from './index'

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('./index')
jest.mock('next/headers')

const mockApiFetch = jest.mocked(apiFetch)
const mockHeaders = jest.mocked(headers)

const WEB_ORIGIN_TOKEN = 'web-origin-secret'
const VISITOR_IP = '203.0.113.7'

// ── Helpers ──────────────────────────────────────────────────────────────────

function incomingRequest(entries: Record<string, string> = {}) {
  mockHeaders.mockResolvedValue(
    new Headers(entries) as unknown as Awaited<ReturnType<typeof headers>>,
  )
}

/** The options `apiFetch` was called with, or `undefined` for a bare call. */
function requestOptions() {
  return mockApiFetch.mock.calls[0]?.[1]
}

/** The query string `apiFetch` was called with, decoded for readability. */
function requestedQuery(): string {
  return decodeURIComponent(String(mockApiFetch.mock.calls[0]?.[0]))
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('searchArticles', () => {
  it('calls /search with the URL-encoded query', async () => {
    await searchArticles({ query: 'WL-6340 WIX' })

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/search?q=WL-6340+WIX',
      expect.anything(),
    )
  })

  it('includes the vehicleId query param when provided', async () => {
    await searchArticles({ query: 'WL6340', vehicleId: 'v-789' })

    expect(requestedQuery()).toBe('/search?q=WL6340&vehicleId=v-789')
  })

  describe('paging', () => {
    it('sends the page number past the first page', async () => {
      await searchArticles({ query: 'WL6340', page: 3, pageSize: 20 })

      expect(requestedQuery()).toContain('page=3')
    })

    // Page 1 is the API's own default, and omitting it keeps one URL — and so
    // one Redis entry — for the search everyone lands on first.
    it('omits the page number on the first page', async () => {
      await searchArticles({ query: 'WL6340', page: 1 })

      expect(requestedQuery()).not.toContain('page=')
    })
  })

  describe('search mode', () => {
    it('sends a non-default mode as searchMode', async () => {
      await searchArticles({ query: 'oil filter', mode: SearchMode.Generic })

      expect(requestedQuery()).toContain('searchMode=generic')
    })

    it('omits the mode when it is the API default', async () => {
      await searchArticles({ query: 'WL6340', mode: SearchMode.PartNumber })

      expect(requestedQuery()).not.toContain('searchMode')
    })
  })

  describe('filters', () => {
    it('repeats brandIds once per brand rather than comma-joining them', async () => {
      await searchArticles({ query: 'WL6340', brandIds: ['268', '30'] })

      expect(requestedQuery()).toContain('brandIds=268&brandIds=30')
    })

    it('repeats productTypeIds once per selected type', async () => {
      await searchArticles({ query: 'филтър', productTypeIds: ['7', '9'] })

      expect(requestedQuery()).toContain('productTypeIds=7&productTypeIds=9')
    })

    it('sends the selected category node', async () => {
      await searchArticles({ query: 'WL6340', categoryNodeId: '100244' })

      expect(requestedQuery()).toContain('categoryNodeId=100244')
    })

    it('sends the leaf hint alongside the category', async () => {
      await searchArticles({
        query: 'WL6340',
        categoryNodeId: '100244',
        categoryHasChildren: false,
      })

      expect(requestedQuery()).toContain('categoryHasChildren=false')
    })

    // The hint describes a category; without one it would ask the API to
    // compute the attribute facets for nothing.
    it('drops the leaf hint when no category is selected', async () => {
      await searchArticles({ query: 'WL6340', categoryHasChildren: false })

      expect(requestedQuery()).not.toContain('categoryHasChildren')
    })

    it('encodes each attribute as a criteriaId:value pair', async () => {
      await searchArticles({
        query: 'WL6340',
        attributes: [
          { criteriaId: '20', value: '106.4' },
          { criteriaId: '2', value: 'Отпред' },
        ],
      })

      expect(requestedQuery()).toContain('attr=20:106.4&attr=2:Отпред')
    })
  })

  describe('client attribution', () => {
    it("forwards the visitor's address with the token that vouches for it", async () => {
      await searchArticles({ query: 'WL6340' })

      expect(requestOptions()?.headers).toEqual({
        'x-forwarded-for': VISITOR_IP,
        'x-web-origin-token': WEB_ORIGIN_TOKEN,
      })
    })

    it('forwards the whole chain so the API can pick the originating address', async () => {
      incomingRequest({ 'x-forwarded-for': `${VISITOR_IP}, 198.51.100.2` })

      await searchArticles({ query: 'WL6340' })

      expect(requestOptions()?.headers).toMatchObject({
        'x-forwarded-for': `${VISITOR_IP}, 198.51.100.2`,
      })
    })

    it('claims nothing when no token is configured', async () => {
      // The API ignores an unvouched-for address anyway.
      delete process.env.WEB_ORIGIN_TOKEN

      await searchArticles({ query: 'WL6340' })

      expect(requestOptions()?.headers).toEqual({})
    })

    it('claims nothing when the incoming request has no forwarded address', async () => {
      incomingRequest()

      await searchArticles({ query: 'WL6340' })

      expect(requestOptions()?.headers).toEqual({})
    })
  })
})
