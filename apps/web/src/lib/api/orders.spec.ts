import {
  CART_TOKEN_HEADER,
  DeliveryMethod,
  ORDER_KEY_HEADER,
  PaymentMethod,
  ShippingMethod,
  type PlaceOrderRequestDto,
  type QuickOrderRequestDto,
} from '@vp-parts-shop/shared'
import { readCartToken } from './cart/cart-token'
import { ApiError, apiFetch } from './index'
import {
  getGuestOrder,
  getOrder,
  orderQueryOptions,
  placeOrder,
  placeQuickOrder,
} from './orders'

jest.mock('./index', () => ({
  ...jest.requireActual('./index'),
  apiFetch: jest.fn(),
}))

jest.mock('./cart/cart-token', () => ({ readCartToken: jest.fn() }))

const mockApiFetch = jest.mocked(apiFetch)
const mockReadCartToken = jest.mocked(readCartToken)

const REQUEST: PlaceOrderRequestDto = {
  cartId: 'cart-1',
  cartVersion: 7,
  expectedTotalCents: 5304,
  paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
  delivery: {
    method: DeliveryMethod.COURIER_OFFICE,
    carrier: ShippingMethod.ECONT,
    officeCode: '1127',
  },
}

const QUICK_REQUEST: QuickOrderRequestDto = {
  ...REQUEST,
  paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
  contact: { firstName: 'Мария', lastName: 'Иванова', phoneNumber: '+359888765432' },
  botCheckToken: 'token-1',
}

beforeEach(() => {
  mockApiFetch.mockReset()
  mockReadCartToken.mockReset()
})

describe('placeOrder', () => {
  it('posts the order as the signed-in customer', () => {
    placeOrder(REQUEST)

    expect(mockApiFetch).toHaveBeenCalledWith('/orders', {
      method: 'POST',
      body: REQUEST,
      withSession: true,
    })
  })
})

describe('placeQuickOrder', () => {
  it('posts the guest’s order with the device’s cart token, and no session', () => {
    mockReadCartToken.mockReturnValue('cart-token')

    placeQuickOrder(QUICK_REQUEST)

    expect(mockApiFetch).toHaveBeenCalledWith('/orders/quick', {
      method: 'POST',
      body: QUICK_REQUEST,
      headers: { [CART_TOKEN_HEADER]: 'cart-token' },
    })
  })

  it('sends no token the device does not hold, for the API to refuse', () => {
    mockReadCartToken.mockReturnValue(null)

    placeQuickOrder(QUICK_REQUEST)

    expect(mockApiFetch).toHaveBeenCalledWith('/orders/quick', {
      method: 'POST',
      body: QUICK_REQUEST,
      headers: undefined,
    })
  })
})

describe('getGuestOrder', () => {
  it('reads the order with the key its link carries, and no session', () => {
    getGuestOrder('VP-ORD-000123', 'key-1')

    expect(mockApiFetch).toHaveBeenCalledWith('/orders/guest/VP-ORD-000123', {
      headers: { [ORDER_KEY_HEADER]: 'key-1' },
    })
  })
})

describe('getOrder', () => {
  it('reads the order as the signed-in customer', () => {
    getOrder('VP-ORD-000123')

    expect(mockApiFetch).toHaveBeenCalledWith('/orders/VP-ORD-000123', { withSession: true })
  })

  it('escapes the id into the path', () => {
    getOrder('a/b')

    expect(mockApiFetch).toHaveBeenCalledWith('/orders/a%2Fb', { withSession: true })
  })
})

describe('orderQueryOptions', () => {
  it('keys the order by its reference and the key it is read with', () => {
    expect(orderQueryOptions('VP-ORD-000123').queryKey).toEqual([
      'orders',
      'order',
      'VP-ORD-000123',
      null,
    ])
    expect(orderQueryOptions('VP-ORD-000123', 'key-1').queryKey).toEqual([
      'orders',
      'order',
      'VP-ORD-000123',
      'key-1',
    ])
  })

  it('reads the order through the account when there is no key', () => {
    orderQueryOptions('VP-ORD-000123').queryFn?.({} as never)

    expect(mockApiFetch).toHaveBeenCalledWith('/orders/VP-ORD-000123', { withSession: true })
  })

  it('reads a guest’s order with its key', () => {
    orderQueryOptions('VP-ORD-000123', 'key-1').queryFn?.({} as never)

    expect(mockApiFetch).toHaveBeenCalledWith('/orders/guest/VP-ORD-000123', {
      headers: { [ORDER_KEY_HEADER]: 'key-1' },
    })
  })

  // Someone else's order, or a bad id, answers the same on a retry.
  it('does not retry a refusal, but retries an outage twice', () => {
    const retryIf = orderQueryOptions('VP-ORD-000123').retry as (count: number, error: Error) => boolean

    expect(retryIf(0, new ApiError(404, 'ORDER_NOT_FOUND'))).toBe(false)
    expect(retryIf(0, new ApiError(503, 'INTERNAL_ERROR'))).toBe(true)
    expect(retryIf(2, new ApiError(503, 'INTERNAL_ERROR'))).toBe(false)
  })
})
