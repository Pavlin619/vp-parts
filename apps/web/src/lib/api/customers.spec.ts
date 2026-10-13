import { AppErrorCode, CustomerRole, type CustomerProfileDto } from '@vp-parts-shop/shared'
import {
  customerProfileQueryOptions,
  fileCustomer,
  getCustomerProfile,
  isCustomerNotFiled,
  updateCustomerProfile,
} from './customers'
import { ApiError } from './index'
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
  jest.mocked(getSessionToken).mockReset().mockResolvedValue('session-jwt')
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

  // Right after sign-up the bridged session can still read as signed out.
  it('sends a token it is handed instead of the bridged session', async () => {
    await fileCustomer('fresh-jwt')

    expect(requestOf()[1].headers.get('Authorization')).toBe('Bearer fresh-jwt')
    expect(getSessionToken).not.toHaveBeenCalled()
  })
})

describe('updateCustomerProfile', () => {
  it('patches only the details it is given, with the session', async () => {
    await expect(updateCustomerProfile({ phoneNumber: '+359888123456' })).resolves.toEqual(
      PROFILE,
    )

    const [url, init] = requestOf()
    expect(url).toMatch(/\/customers\/me$/)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body ?? '')).toEqual({ phoneNumber: '+359888123456' })
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

describe('isCustomerNotFiled', () => {
  it('recognises a signed-in user the API has no customer for yet', () => {
    expect(
      isCustomerNotFiled(new ApiError(404, AppErrorCode.CUSTOMER_PROFILE_INCOMPLETE)),
    ).toBe(true)
  })

  it.each([
    ['another API error', new ApiError(503, 'UNKNOWN_ERROR')],
    ['a network failure', new TypeError('Failed to fetch')],
    ['nothing', null],
  ])('refuses %s', (_, error) => {
    expect(isCustomerNotFiled(error)).toBe(false)
  })
})
