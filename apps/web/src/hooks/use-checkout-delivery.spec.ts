import { renderHook } from '@testing-library/react'
import { ShippingMethod } from '@vp-parts-shop/shared'
import {
  useCheckoutDelivery,
  useDeliveryMethod,
  useSelectedOfficeCode,
} from './use-checkout-delivery'

beforeEach(() => {
  useCheckoutDelivery.setState({ method: 'courier-address', office: null })
  window.localStorage.clear()
})

describe('useCheckoutDelivery', () => {
  it('starts on delivery to an address with no office chosen', () => {
    expect(useCheckoutDelivery.getState()).toMatchObject({
      method: 'courier-address',
      office: null,
    })
  })

  it('remembers the chosen method', () => {
    useCheckoutDelivery.getState().setMethod('courier-office')

    expect(useCheckoutDelivery.getState().method).toBe('courier-office')
  })

  it('remembers the chosen office with its carrier', () => {
    useCheckoutDelivery
      .getState()
      .selectOffice({ carrier: ShippingMethod.ECONT, code: '1127' })

    expect(useCheckoutDelivery.getState().office).toEqual({
      carrier: ShippingMethod.ECONT,
      code: '1127',
    })
  })

  it('forgets the office on request', () => {
    useCheckoutDelivery
      .getState()
      .selectOffice({ carrier: ShippingMethod.ECONT, code: '1127' })
    useCheckoutDelivery.getState().clearOffice()

    expect(useCheckoutDelivery.getState().office).toBeNull()
  })

  // Only the choice is kept on the device; nothing that names the customer.
  it('saves the method and office to localStorage', () => {
    useCheckoutDelivery.getState().setMethod('courier-office')
    useCheckoutDelivery
      .getState()
      .selectOffice({ carrier: ShippingMethod.ECONT, code: '1127' })

    const saved = JSON.parse(
      window.localStorage.getItem('vp-checkout-delivery') ?? '{}',
    )
    expect(saved.state).toEqual({
      method: 'courier-office',
      office: { carrier: ShippingMethod.ECONT, code: '1127' },
    })
  })
})

describe('useDeliveryMethod', () => {
  it('reads the chosen method once hydrated', () => {
    useCheckoutDelivery.setState({ method: 'courier-office' })

    const { result } = renderHook(() => useDeliveryMethod())

    expect(result.current).toBe('courier-office')
  })
})

describe('useSelectedOfficeCode', () => {
  it("reads the chosen office's code for its carrier", () => {
    useCheckoutDelivery.setState({
      office: { carrier: ShippingMethod.ECONT, code: '1127' },
    })

    const { result } = renderHook(() => useSelectedOfficeCode(ShippingMethod.ECONT))

    expect(result.current).toBe('1127')
  })

  // An Econt office code means nothing to Speedy.
  it("reads nothing for another carrier's office", () => {
    useCheckoutDelivery.setState({
      office: { carrier: ShippingMethod.ECONT, code: '1127' },
    })

    const { result } = renderHook(() => useSelectedOfficeCode(ShippingMethod.SPEEDY))

    expect(result.current).toBeNull()
  })
})
