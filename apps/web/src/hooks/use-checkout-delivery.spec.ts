import { renderHook } from '@testing-library/react'
import { ShippingMethod } from '@vp-parts-shop/shared'
import {
  useCheckoutDelivery,
  useDeliveryMethod,
  useSelectedAddress,
  useSelectedOfficeCode,
} from './use-checkout-delivery'

beforeEach(() => {
  useCheckoutDelivery.getState().reset()
  window.localStorage.clear()
})

describe('useCheckoutDelivery', () => {
  it('starts with no method, office or address chosen', () => {
    expect(useCheckoutDelivery.getState()).toMatchObject({
      method: null,
      office: null,
      address: null,
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
      address: null,
    })
  })
})

describe('reset', () => {
  // The remembered office and address are the signed-out customer's, not the
  // next person's to use this device.
  it('forgets the method, office and address', () => {
    useCheckoutDelivery.setState({
      method: 'courier-office',
      office: { carrier: ShippingMethod.ECONT, code: '1127' },
      address: {
        carrier: ShippingMethod.ECONT,
        address: { placeId: '41', street: 'бул. Витоша', streetNumber: '1' },
        label: 'бул. Витоша 1, София',
      },
    })

    useCheckoutDelivery.getState().reset()

    expect(useCheckoutDelivery.getState()).toMatchObject({
      method: null,
      office: null,
      address: null,
    })
  })
})

describe('useDeliveryMethod', () => {
  it('reads no method before the customer picks one', () => {
    const { result } = renderHook(() => useDeliveryMethod())

    expect(result.current).toBeNull()
  })

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

describe('the remembered address', () => {
  const selected = {
    carrier: ShippingMethod.ECONT,
    address: { placeId: '41', street: 'бул. Витоша', streetNumber: '1' },
    label: 'бул. Витоша 1, София',
  }

  it('is kept once selected', () => {
    useCheckoutDelivery.getState().selectAddress(selected)

    expect(useCheckoutDelivery.getState().address).toEqual(selected)
  })

  it('is read only for the carrier it was accepted for', () => {
    useCheckoutDelivery.getState().selectAddress(selected)

    const { result } = renderHook(() => useSelectedAddress(ShippingMethod.ECONT))
    const other = renderHook(() => useSelectedAddress(ShippingMethod.SPEEDY))

    expect(result.current).toEqual(selected)
    expect(other.result.current).toBeNull()
  })
})
