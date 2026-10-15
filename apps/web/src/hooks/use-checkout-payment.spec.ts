import { renderHook } from '@testing-library/react'
import { PaymentMethod } from '@vp-parts-shop/shared'
import { useCheckoutPayment, usePaymentMethod } from './use-checkout-payment'

beforeEach(() => {
  useCheckoutPayment.getState().reset()
  window.localStorage.clear()
})

describe('useCheckoutPayment', () => {
  it('starts with no method chosen', () => {
    expect(useCheckoutPayment.getState().method).toBeNull()
  })

  it('remembers the chosen method on the device', () => {
    useCheckoutPayment.getState().setMethod(PaymentMethod.CASH_ON_DELIVERY)

    expect(useCheckoutPayment.getState().method).toBe(PaymentMethod.CASH_ON_DELIVERY)
    const saved = JSON.parse(window.localStorage.getItem('vp-checkout-payment') ?? '{}')
    expect(saved.state).toEqual({ method: PaymentMethod.CASH_ON_DELIVERY })
  })

  it('forgets the method on reset', () => {
    useCheckoutPayment.getState().setMethod(PaymentMethod.CARD)

    useCheckoutPayment.getState().reset()

    expect(useCheckoutPayment.getState().method).toBeNull()
  })
})

describe('usePaymentMethod', () => {
  it('reads no method before the customer picks one', () => {
    const { result } = renderHook(() => usePaymentMethod())

    expect(result.current).toBeNull()
  })

  it('reads the chosen method once hydrated', () => {
    useCheckoutPayment.setState({ method: PaymentMethod.CARD })

    const { result } = renderHook(() => usePaymentMethod())

    expect(result.current).toBe(PaymentMethod.CARD)
  })
})
