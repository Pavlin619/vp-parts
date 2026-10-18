import {
  DeliveryMethod,
  PaymentMethod,
  ShippingMethod,
  type PlaceOrderRequestDto,
} from '@vp-parts-shop/shared'
import { ApiError, apiFetch } from './index'
import { getOrder, orderQueryOptions, placeOrder } from './orders'

jest.mock('./index', () => ({
  ...jest.requireActual('./index'),
  apiFetch: jest.fn(),
}))

const mockApiFetch = jest.mocked(apiFetch)

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

beforeEach(() => {
  mockApiFetch.mockReset()
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
  it('keys the order by its id', () => {
    expect(orderQueryOptions('VP-ORD-000123').queryKey).toEqual(['orders', 'order', 'VP-ORD-000123'])
  })

  it('queryFn reads the order', () => {
    orderQueryOptions('VP-ORD-000123').queryFn?.({} as never)

    expect(mockApiFetch).toHaveBeenCalledWith('/orders/VP-ORD-000123', { withSession: true })
  })

  // Someone else's order, or a bad id, answers the same on a retry.
  it('does not retry a refusal, but retries an outage twice', () => {
    const retryIf = orderQueryOptions('VP-ORD-000123').retry as (count: number, error: Error) => boolean

    expect(retryIf(0, new ApiError(404, 'ORDER_NOT_FOUND'))).toBe(false)
    expect(retryIf(0, new ApiError(503, 'INTERNAL_ERROR'))).toBe(true)
    expect(retryIf(2, new ApiError(503, 'INTERNAL_ERROR'))).toBe(false)
  })
})
