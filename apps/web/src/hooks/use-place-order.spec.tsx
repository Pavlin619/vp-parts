import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import {
  AppErrorCode,
  CustomerRole,
  DeliveryMethod,
  PaymentMethod,
  ShippingMethod,
  type CustomerProfileDto,
} from '@vp-parts-shop/shared'
import { ApiError } from '@/lib/api'
import { cartQueryOptions } from '@/lib/api/cart'
import { AVAILABILITY_QUERY_KEY } from '@/lib/api/catalog'
import { CHECKOUT_QUERY_KEY, DELIVERY_QUOTE_QUERY_KEY } from '@/lib/api/checkout'
import { customerProfileQueryOptions } from '@/lib/api/customers'
import { placeOrder, placeQuickOrder } from '@/lib/api/orders'
import type { SummaryMoney } from '@/lib/checkout/delivery/delivery-summary'
import { useCart } from './use-cart'
import { useCheckoutDelivery } from './use-checkout-delivery'
import { useCheckoutPayment } from './use-checkout-payment'
import { usePlaceOrder } from './use-place-order'
import { useQuickOrder } from './use-quick-order'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
jest.mock('@/lib/api/orders', () => ({ placeOrder: jest.fn(), placeQuickOrder: jest.fn() }))
jest.mock('@/lib/api/cart', () => ({
  ...jest.createMockFromModule<object>('@/lib/api/cart'),
  cartQueryOptions: jest.requireActual('@/lib/api/cart').cartQueryOptions,
}))
jest.mock('@/lib/api/customers', () => ({
  customerProfileQueryOptions: jest.requireActual('@/lib/api/customers')
    .customerProfileQueryOptions,
}))

const mockPlaceOrder = jest.mocked(placeOrder)
const mockPlaceQuickOrder = jest.mocked(placeQuickOrder)
const replace = jest.fn()

const PROFILE: CustomerProfileDto = {
  id: 'customer-1',
  email: 'ivan@example.bg',
  firstName: 'Иван',
  lastName: 'Петров',
  phoneNumber: '+359888123456',
  role: CustomerRole.CUSTOMER,
  createdAt: '2026-10-01T10:00:00.000Z',
}

const MONEY: SummaryMoney = {
  cartVersion: 7,
  goodsTotal: 4845,
  netAmount: 4420,
  vatAmount: 884,
  total: 5304,
  isDeliveryIncluded: true,
}

let queryClient: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function renderPlaceOrder(
  money: SummaryMoney | null = MONEY,
  areLinesOrderable = true,
  isQuickOrder = false,
) {
  return renderHook(() => usePlaceOrder({ money, areLinesOrderable, isQuickOrder }), { wrapper })
}

describe('usePlaceOrder', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    queryClient.setQueryData(customerProfileQueryOptions.queryKey, PROFILE)
    jest.mocked(useAuth).mockReturnValue({ isSignedIn: true } as ReturnType<typeof useAuth>)
    jest.mocked(useRouter).mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>)
    replace.mockReset()
    mockPlaceOrder.mockReset().mockResolvedValue({ orderId: 'order-1', orderReference: 'VP-ORD-000123' })
    useCart.setState({ cartId: 'cart-1', version: 7 })
    useCheckoutDelivery.setState({
      method: 'courier-office',
      office: { carrier: ShippingMethod.ECONT, code: '1127' },
      address: null,
    })
    useCheckoutPayment.setState({ method: PaymentMethod.CASH_ON_DELIVERY })
    useQuickOrder.getState().reset()
  })

  it('places the order the checkout shows', async () => {
    const { result } = renderPlaceOrder()
    expect(result.current.canPlace).toBe(true)

    act(() => result.current.place())

    await waitFor(() => expect(mockPlaceOrder).toHaveBeenCalled())
    expect(mockPlaceOrder.mock.calls[0][0]).toEqual({
      cartId: 'cart-1',
      cartVersion: 7,
      expectedTotalCents: 5304,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      delivery: {
        method: DeliveryMethod.COURIER_OFFICE,
        carrier: ShippingMethod.ECONT,
        officeCode: '1127',
      },
    })
  })

  it('cannot place an order while the money is being read', () => {
    const { result } = renderPlaceOrder(null)

    expect(result.current.canPlace).toBe(false)
    act(() => result.current.place())
    expect(mockPlaceOrder).not.toHaveBeenCalled()
  })

  it('cannot place an order while a line cannot be ordered', () => {
    expect(renderPlaceOrder(MONEY, false).result.current.canPlace).toBe(false)
  })

  it('cannot place an order with a profile that lacks the phone', () => {
    queryClient.setQueryData(customerProfileQueryOptions.queryKey, {
      ...PROFILE,
      phoneNumber: null,
    })

    expect(renderPlaceOrder().result.current.canPlace).toBe(false)
  })

  it('cannot place an order signed out', () => {
    jest.mocked(useAuth).mockReturnValue({ isSignedIn: false } as ReturnType<typeof useAuth>)

    expect(renderPlaceOrder().result.current.canPlace).toBe(false)
  })

  // A double click must not send a second request; the cart would answer it anyway.
  it('sends one request however often it is clicked while pending', async () => {
    mockPlaceOrder.mockReturnValue(new Promise(() => {}))
    const { result } = renderPlaceOrder()

    act(() => result.current.place())
    await waitFor(() => expect(result.current.isPlacing).toBe(true))
    act(() => result.current.place())

    expect(mockPlaceOrder).toHaveBeenCalledTimes(1)
    expect(result.current.canPlace).toBe(false)
  })

  describe('once placed', () => {
    it('opens the order, forgets the choices and resyncs the cart', async () => {
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries')
      const { result } = renderPlaceOrder()

      act(() => result.current.place())

      await waitFor(() => expect(replace).toHaveBeenCalledWith('/orders/VP-ORD-000123'))
      expect(result.current.isPlaced).toBe(true)
      expect(useCheckoutDelivery.getState().method).toBeNull()
      expect(useCheckoutPayment.getState().method).toBeNull()
      expect(invalidate).toHaveBeenCalledWith({ queryKey: cartQueryOptions.queryKey })
    })
  })

  describe('refused', () => {
    async function refuseWith(error: Error) {
      mockPlaceOrder.mockRejectedValue(error)
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries')
      const { result } = renderPlaceOrder()

      act(() => result.current.place())
      await waitFor(() => expect(result.current.failure).not.toBeNull())

      return { result, invalidated: invalidate.mock.calls.map(([filters]) => filters?.queryKey) }
    }

    it('re-reads the prices and remembers the total shown on PRICE_CHANGED', async () => {
      const { result, invalidated } = await refuseWith(
        new ApiError(409, AppErrorCode.PRICE_CHANGED),
      )

      expect(result.current.failure).toEqual({ kind: 'price-changed', shownTotal: 5304 })
      expect(invalidated).toEqual(
        expect.arrayContaining([AVAILABILITY_QUERY_KEY, CHECKOUT_QUERY_KEY]),
      )
    })

    it('resyncs the cart on CART_STALE', async () => {
      const { invalidated } = await refuseWith(new ApiError(409, AppErrorCode.CART_STALE))

      expect(invalidated).toEqual(expect.arrayContaining([cartQueryOptions.queryKey]))
    })

    it('re-reads the profile on CUSTOMER_DETAILS_REQUIRED', async () => {
      const { invalidated } = await refuseWith(
        new ApiError(422, AppErrorCode.CUSTOMER_DETAILS_REQUIRED),
      )

      expect(invalidated).toEqual([customerProfileQueryOptions.queryKey])
    })

    it('re-asks the quote, so the delivery panel names the problem', async () => {
      const { invalidated } = await refuseWith(
        new ApiError(422, AppErrorCode.DELIVERY_OFFICE_REFUSED),
      )

      expect(invalidated).toEqual([DELIVERY_QUOTE_QUERY_KEY])
    })

    it('drops the delivery refusal once another office is chosen', async () => {
      const { result } = await refuseWith(new ApiError(422, AppErrorCode.DELIVERY_OFFICE_REFUSED))

      act(() =>
        useCheckoutDelivery.setState({ office: { carrier: ShippingMethod.ECONT, code: '2000' } }),
      )

      expect(result.current.failure).toBeNull()
    })

    it('changes nothing on an outage, and lets the customer try again', async () => {
      const { result, invalidated } = await refuseWith(
        new ApiError(503, AppErrorCode.DELIVERY_UNAVAILABLE),
      )

      expect(result.current.failure).toEqual({ kind: 'retry' })
      expect(invalidated).toEqual([])
      expect(result.current.canPlace).toBe(true)
      expect(replace).not.toHaveBeenCalled()
    })
  })

  describe('a quick order', () => {
    const renderQuickOrder = () => renderPlaceOrder(MONEY, true, true)

    function fillContact() {
      const { setContactField } = useQuickOrder.getState()
      setContactField('firstName', 'Мария')
      setContactField('lastName', 'Иванова')
      setContactField('phoneNumber', '0888 765 432')
    }

    beforeEach(() => {
      jest.mocked(useAuth).mockReturnValue({ isSignedIn: false } as ReturnType<typeof useAuth>)
      // A quick order hides the payment panel: it is paid on delivery whatever was chosen.
      useCheckoutPayment.setState({ method: null })
      mockPlaceQuickOrder.mockReset().mockResolvedValue({
        orderId: 'order-1',
        orderReference: 'VP-ORD-000123',
        accessKey: 'key-1',
      })
      fillContact()
      useQuickOrder.getState().solveBotCheck('token-1')
    })

    it('places the guest’s order with the contact and the bot check’s token', async () => {
      const { result } = renderQuickOrder()
      expect(result.current.canPlace).toBe(true)

      act(() => result.current.place())

      await waitFor(() => expect(mockPlaceQuickOrder).toHaveBeenCalled())
      expect(mockPlaceQuickOrder.mock.calls[0][0]).toEqual({
        cartId: 'cart-1',
        cartVersion: 7,
        expectedTotalCents: 5304,
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        delivery: {
          method: DeliveryMethod.COURIER_OFFICE,
          carrier: ShippingMethod.ECONT,
          officeCode: '1127',
        },
        contact: { firstName: 'Мария', lastName: 'Иванова', phoneNumber: '+359888765432' },
        botCheckToken: 'token-1',
      })
      expect(mockPlaceOrder).not.toHaveBeenCalled()
    })

    it('cannot place it while the contact is not valid', () => {
      useQuickOrder.getState().setContactField('phoneNumber', '02 987 6543')

      expect(renderQuickOrder().result.current.canPlace).toBe(false)
    })

    it('cannot place it before the bot check has passed', () => {
      useQuickOrder.getState().expireBotCheck()

      expect(renderQuickOrder().result.current.canPlace).toBe(false)
    })

    it('opens the order with its key, and forgets the contact', async () => {
      const { result } = renderQuickOrder()

      act(() => result.current.place())

      await waitFor(() => expect(replace).toHaveBeenCalledWith('/orders/VP-ORD-000123#k=key-1'))
      expect(useQuickOrder.getState().contact.firstName).toBe('')
    })

    // The API spends the token on the way to any refusal after its check.
    it('asks the widget for a fresh token after a refusal, keeping the contact', async () => {
      mockPlaceQuickOrder.mockRejectedValue(new ApiError(409, AppErrorCode.PRICE_CHANGED))
      const { result } = renderQuickOrder()

      act(() => result.current.place())

      await waitFor(() => expect(result.current.failure).not.toBeNull())
      expect(useQuickOrder.getState().botCheck).toMatchObject({ token: null, round: 1 })
      expect(useQuickOrder.getState().contact.firstName).toBe('Мария')
      expect(result.current.canPlace).toBe(false)
    })

    it('says the bot check must be passed again on BOT_CHECK_FAILED', async () => {
      mockPlaceQuickOrder.mockRejectedValue(new ApiError(400, AppErrorCode.BOT_CHECK_FAILED))
      const { result } = renderQuickOrder()

      act(() => result.current.place())

      await waitFor(() => expect(result.current.failure).toEqual({ kind: 'bot-check' }))
    })
  })
})
