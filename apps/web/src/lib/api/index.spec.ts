import { apiFetch, ApiError } from './index'

const mockFetch = jest.fn()
global.fetch = mockFetch

function makeOkResponse(body: unknown, status = 200) {
  return {
    ok: true,
    status,
    json: () => Promise.resolve(body),
  }
}

function makeErrorResponse(status: number, body: unknown) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
  }
}

beforeEach(() => {
  mockFetch.mockClear()
})

describe('apiFetch', () => {
  it('calls fetch with the full URL', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({}))
    await apiFetch('/catalog/manufacturers')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/catalog/manufacturers'),
      expect.any(Object),
    )
  })

  it('sets Content-Type to application/json when a body is provided', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({}))
    await apiFetch('/some-path', { body: { key: 'value' } })
    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Headers }]
    expect(init.headers.get('Content-Type')).toBe('application/json')
  })

  it('does not set Content-Type when no body is provided', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({}))
    await apiFetch('/some-path')
    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Headers }]
    expect(init.headers.get('Content-Type')).toBeNull()
  })

  it('sets Authorization header when a token is provided', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({}))
    await apiFetch('/some-path', { token: 'my-token' })
    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Headers }]
    expect(init.headers.get('Authorization')).toBe('Bearer my-token')
  })

  it('does not set Authorization header when no token is provided', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({}))
    await apiFetch('/some-path')
    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Headers }]
    expect(init.headers.get('Authorization')).toBeNull()
  })

  it('returns undefined for a 204 No Content response', async () => {
    mockFetch.mockResolvedValue(makeOkResponse(undefined, 204))
    const result = await apiFetch('/some-path')
    expect(result).toBeUndefined()
  })

  it('throws ApiError with the parsed error payload on a non-ok response', async () => {
    mockFetch.mockResolvedValue(
      makeErrorResponse(404, { statusCode: 404, errorCode: 'ORDER_NOT_FOUND' }),
    )
    await expect(apiFetch('/orders/1')).rejects.toMatchObject({
      statusCode: 404,
      errorCode: 'ORDER_NOT_FOUND',
    })
    await expect(apiFetch('/orders/1')).rejects.toBeInstanceOf(ApiError)
  })

  it('falls back to UNKNOWN_ERROR when the error body cannot be parsed', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('bad json')),
    })
    await expect(apiFetch('/some-path')).rejects.toMatchObject({
      statusCode: 500,
      errorCode: 'UNKNOWN_ERROR',
    })
  })

  it('serialises the body as JSON', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({}))
    await apiFetch('/some-path', { body: { a: 1 } })
    const [, init] = mockFetch.mock.calls[0] as [string, { body: string }]
    expect(init.body).toBe(JSON.stringify({ a: 1 }))
  })
})
