import { CART_TOKEN_HEADER, EMPTY_CART } from '@vp-parts-shop/shared'
import {
  adoptCart,
  addCartLine,
  clearCart,
  getCart,
  hasCartToRead,
  removeCartLine,
  setCartSelection,
  updateCartLine,
} from './index'
import { clearCartToken, readCartToken } from './cart-token'
import { getSessionToken } from '../session-token'

jest.mock('../session-token')

const mockedGetSessionToken = jest.mocked(getSessionToken)

const mockFetch = jest.fn()
global.fetch = mockFetch

const TOKEN = 'a'.repeat(43)

function response(body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
  }
}

function requestOf(call = 0): [string, { headers: Headers; method?: string; body?: string }] {
  return mockFetch.mock.calls[call] as [
    string,
    { headers: Headers; method?: string; body?: string },
  ]
}

const LINE = {
  brandId: '268',
  articleNumber: 'WL6340',
  quantity: 2,
  brandName: 'WIX',
  brandLogoUrl: null,
  description: 'Маслен филтър',
  thumbnailUrl: null,
  addedAtPriceIncVat: 1900,
}

beforeEach(() => {
  mockFetch.mockReset()
  window.localStorage.clear()
  mockFetch.mockResolvedValue(response(EMPTY_CART))
  mockedGetSessionToken.mockResolvedValue(null)
})

describe('the cart token', () => {
  it('is sent on every cart request once the browser holds one', async () => {
    window.localStorage.setItem('vp-cart-token', TOKEN)

    await getCart()

    const [, init] = requestOf()
    expect(init.headers.get(CART_TOKEN_HEADER)).toBe(TOKEN)
  })

  it('is not sent when the browser holds none', async () => {
    await addCartLine(LINE)

    const [, init] = requestOf()
    expect(init.headers.get(CART_TOKEN_HEADER)).toBeNull()
  })

  // The server mints a cart on the first write and names it in that one
  // response. Missing it loses the cart that was just created.
  it('is kept when the server mints one', async () => {
    mockFetch.mockResolvedValue(
      response(EMPTY_CART, { [CART_TOKEN_HEADER]: TOKEN }),
    )

    await addCartLine(LINE)

    expect(readCartToken()).toBe(TOKEN)
  })

  it('is left alone by a response that mints nothing', async () => {
    window.localStorage.setItem('vp-cart-token', TOKEN)

    await updateCartLine({ brandId: '268', articleNumber: 'WL6340' }, {
      quantity: 3,
    })

    expect(readCartToken()).toBe(TOKEN)
  })

  it('is dropped when a customer claims the cart', () => {
    window.localStorage.setItem('vp-cart-token', TOKEN)

    clearCartToken()

    expect(readCartToken()).toBeNull()
  })

  it('reads as absent when storage itself refuses', () => {
    const getItem = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('site data blocked')
      })

    expect(readCartToken()).toBeNull()

    getItem.mockRestore()
  })
})

describe('getCart', () => {
  // A visitor who has never added anything has no cart, and the round trip
  // would only confirm what the missing token already says.
  it('answers empty without asking the server', async () => {
    await expect(getCart()).resolves.toEqual(EMPTY_CART)

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('asks the server once there is a cart to ask about', async () => {
    window.localStorage.setItem('vp-cart-token', TOKEN)

    await getCart()

    const [url, init] = requestOf()
    expect(url).toContain('/cart')
    expect(init.method).toBe('GET')
  })

  // A signed-in customer's cart is found by their account, and the device
  // holds no guest token for it.
  it('asks the server for a signed-in customer with no cart token', async () => {
    mockedGetSessionToken.mockResolvedValue('session-jwt')

    await getCart()

    const [, init] = requestOf()
    expect(init.headers.get('Authorization')).toBe('Bearer session-jwt')
    expect(init.headers.get(CART_TOKEN_HEADER)).toBeNull()
  })
})

describe('hasCartToRead', () => {
  it('is false for a signed-out visitor with no cart token', async () => {
    await expect(hasCartToRead()).resolves.toBe(false)
  })

  it('is true once the device holds a cart token', async () => {
    window.localStorage.setItem('vp-cart-token', TOKEN)

    await expect(hasCartToRead()).resolves.toBe(true)
  })

  it('is true for a signed-in customer', async () => {
    mockedGetSessionToken.mockResolvedValue('session-jwt')

    await expect(hasCartToRead()).resolves.toBe(true)
  })
})

describe('the session', () => {
  it('is sent with every cart write', async () => {
    mockedGetSessionToken.mockResolvedValue('session-jwt')

    await addCartLine(LINE)

    const [, init] = requestOf()
    expect(init.headers.get('Authorization')).toBe('Bearer session-jwt')
  })

  it('is sent with the adopt alongside the guest token', async () => {
    mockedGetSessionToken.mockResolvedValue('session-jwt')
    window.localStorage.setItem('vp-cart-token', TOKEN)
    mockFetch.mockResolvedValue(response({ cart: EMPTY_CART, droppedLines: [] }))

    await adoptCart()

    const [url, init] = requestOf()
    expect(url).toMatch(/\/cart\/adopt$/)
    expect(init.method).toBe('POST')
    expect(init.headers.get('Authorization')).toBe('Bearer session-jwt')
    expect(init.headers.get(CART_TOKEN_HEADER)).toBe(TOKEN)
  })
})

describe('the routes each call reaches', () => {
  beforeEach(() => window.localStorage.setItem('vp-cart-token', TOKEN))

  it('posts a whole line to add one', async () => {
    await addCartLine(LINE)

    const [url, init] = requestOf()
    expect(url).toContain('/cart/items')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(LINE)
  })

  // Brand and number both travel in the path: a number alone names as many
  // parts as there are suppliers filing it.
  it('names both halves of the identity in a line path', async () => {
    await updateCartLine({ brandId: '268', articleNumber: 'WL6340' }, {
      quantity: 3,
    })

    const [url, init] = requestOf()
    expect(url).toContain('/cart/items/268/WL6340')
    expect(init.method).toBe('PATCH')
  })

  it('escapes an article number that would otherwise break the path', async () => {
    await removeCartLine({ brandId: '268', articleNumber: 'A/B 12' })

    const [url] = requestOf()
    expect(url).toContain('/cart/items/268/A%2FB%2012')
  })

  it('posts the selection for every line at once', async () => {
    await setCartSelection(false)

    const [url, init] = requestOf()
    expect(url).toContain('/cart/selection')
    expect(JSON.parse(init.body as string)).toEqual({ isSelected: false })
  })

  it('deletes the cart to clear it', async () => {
    await clearCart()

    const [url, init] = requestOf()
    expect(url).toMatch(/\/cart$/)
    expect(init.method).toBe('DELETE')
  })
})
