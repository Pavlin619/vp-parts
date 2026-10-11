import { CustomerRole, type CustomerProfileDto } from '@vp-parts-shop/shared'
import {
  customerProfileQueryOptions,
  fileCustomer,
  getCustomerProfile,
} from './customers'
import { getSessionToken } from './session-token'

jest.mock('./session-token')

const mockFetch = jest.fn()
global.fetch = mockFetch

const PROFILE: CustomerProfileDto = {
  id: 'customer-1',
  email: 'ivan@example.bg',
  firstName: 'Иван',
  lastName: 'Петров',
  phoneNumber: '+359888123456',
  role: CustomerRole.CUSTOMER,
  createdAt: '2026-10-01T10:00:00.000Z',
  defaultAddress: null,
}

function requestOf(call = 0): [string, { headers: Headers; method?: string; body?: string }] {
  return mockFetch.mock.calls[call] as [
    string,
    { headers: Headers; method?: string; body?: string },
  ]
}

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(PROFILE),
  })
  jest.mocked(getSessionToken).mockResolvedValue('session-jwt')
})

describe('getCustomerProfile', () => {
  it('reads the signed-in customer with their session', async () => {
    await expect(getCustomerProfile()).resolves.toEqual(PROFILE)

    const [url, init] = requestOf()
    expect(url).toMatch(/\/customers\/me$/)
    expect(init.method ?? 'GET').toBe('GET')
    expect(init.headers.get('Authorization')).toBe('Bearer session-jwt')
  })
})

describe('fileCustomer', () => {
  // Everything the filing needs travels in the Clerk user's metadata.
  it('posts with the session and no body', async () => {
    await expect(fileCustomer()).resolves.toEqual(PROFILE)

    const [url, init] = requestOf()
    expect(url).toMatch(/\/customers\/me$/)
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(init.headers.get('Authorization')).toBe('Bearer session-jwt')
  })
})

describe('customerProfileQueryOptions', () => {
  it('is keyed by domain and entity', () => {
    expect(customerProfileQueryOptions.queryKey).toEqual(['customers', 'me'])
  })

  // A 404 means "not filed yet", which the session sync answers by filing —
  // retrying the read only delays that.
  it('does not retry', () => {
    expect(customerProfileQueryOptions.retry).toBe(false)
  })
})
