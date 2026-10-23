import {
  AppErrorCode,
  DeliveryMethod,
  PaymentMethod,
  ShippingMethod,
  type PlaceOrderRequestDto,
} from '@vp-parts-shop/shared'
import { ApiError } from '@/lib/api'
import type { SummaryMoney } from './delivery/delivery-summary'
import {
  isFailureCurrent,
  placeOrderFailureOf,
  placeOrderRequestOf,
  quickOrderRequestOf,
  type PlaceOrderInput,
} from './place-order'

const QUOTED: SummaryMoney = {
  cartVersion: 7,
  goodsTotal: 4845,
  netAmount: 4420,
  vatAmount: 884,
  total: 5304,
  isDeliveryIncluded: true,
}

const ADDRESS = { placeId: '41', street: 'бул. Витоша', streetNumber: '1', note: 'Звънец 3' }

function input(overrides: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  return {
    cartId: 'cart-1',
    cartVersion: 7,
    method: 'courier-office',
    officeCode: '1127',
    address: null,
    paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
    money: QUOTED,
    isContactComplete: true,
    areLinesOrderable: true,
    ...overrides,
  }
}

describe('placeOrderRequestOf', () => {
  it('orders to an office at the version and total the summary shows', () => {
    expect(placeOrderRequestOf(input())).toEqual({
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

  // The quote leaves the note out, since it moves no price; the order keeps it for the courier.
  it('orders to an address with the courier’s note', () => {
    const request = placeOrderRequestOf(
      input({ method: 'courier-address', officeCode: null, address: ADDRESS }),
    )

    expect(request?.delivery).toEqual({
      method: DeliveryMethod.COURIER_ADDRESS,
      carrier: ShippingMethod.ECONT,
      address: ADDRESS,
    })
  })

  it('orders a store pickup at the goods total, which is the whole order', () => {
    const request = placeOrderRequestOf(
      input({
        method: 'store-pickup',
        officeCode: null,
        money: { ...QUOTED, total: 4845, isDeliveryIncluded: true },
      }),
    )

    expect(request).toMatchObject({
      expectedTotalCents: 4845,
      delivery: { method: DeliveryMethod.STORE_PICKUP },
    })
  })

  it.each<[string, Partial<PlaceOrderInput>]>([
    ['the cart has no id yet', { cartId: '' }],
    ['no delivery method is chosen', { method: null }],
    ['the office is not chosen', { officeCode: null }],
    ['the address is not given', { method: 'courier-address', officeCode: null }],
    ['the payment method is not chosen', { paymentMethod: null }],
    ['card is chosen, which cannot be ordered yet', { paymentMethod: PaymentMethod.CARD }],
    ['the money is still being read', { money: null }],
    // The last figures stand while the next version is read; they are not this cart's total.
    ['the money was priced for an earlier cart version', { cartVersion: 8 }],
    ['the total leaves the delivery out', { money: { ...QUOTED, isDeliveryIncluded: false } }],
    ['who the order is for is not known yet', { isContactComplete: false }],
    ['a line cannot be ordered', { areLinesOrderable: false }],
  ])('builds no order while %s', (_, overrides) => {
    expect(placeOrderRequestOf(input(overrides))).toBeNull()
  })
})

describe('quickOrderRequestOf', () => {
  const ORDER = placeOrderRequestOf(input())
  const CONTACT = { firstName: 'Мария', lastName: 'Иванова', phoneNumber: '+359888765432' }

  // The bot check's token is added at the click, by a challenge of its own.
  it('adds the guest’s contact to the order, and no token yet', () => {
    expect(quickOrderRequestOf(ORDER, CONTACT)).toEqual({ ...ORDER, contact: CONTACT })
  })

  it('asks a guest to pay on delivery, whatever the order was built with', () => {
    const card = { ...ORDER!, paymentMethod: PaymentMethod.CARD }

    expect(quickOrderRequestOf(card, CONTACT)?.paymentMethod).toBe(PaymentMethod.CASH_ON_DELIVERY)
  })

  it.each<[string, Parameters<typeof quickOrderRequestOf>]>([
    ['the order cannot be placed yet', [null, CONTACT]],
    ['the contact is not valid', [ORDER, null]],
  ])('builds nothing while %s', (_, args) => {
    expect(quickOrderRequestOf(...args)).toBeNull()
  })
})

describe('placeOrderFailureOf', () => {
  const SENT: PlaceOrderRequestDto = placeOrderRequestOf(input())!

  it('says the price changed from the total that was sent', () => {
    expect(placeOrderFailureOf(new ApiError(409, AppErrorCode.PRICE_CHANGED), SENT)).toEqual({
      kind: 'price-changed',
      shownTotal: 5304,
    })
  })

  it.each([AppErrorCode.CART_STALE, AppErrorCode.CART_EMPTY, AppErrorCode.NOT_FOUND])(
    'resyncs the cart on %s',
    (code) => {
      expect(placeOrderFailureOf(new ApiError(409, code), SENT)).toEqual({ kind: 'cart-stale' })
    },
  )

  it('points at the blocked lines on ARTICLE_UNAVAILABLE', () => {
    expect(
      placeOrderFailureOf(new ApiError(422, AppErrorCode.ARTICLE_UNAVAILABLE), SENT),
    ).toEqual({ kind: 'unavailable' })
  })

  it('asks for the missing details on CUSTOMER_DETAILS_REQUIRED', () => {
    expect(
      placeOrderFailureOf(new ApiError(422, AppErrorCode.CUSTOMER_DETAILS_REQUIRED), SENT),
    ).toEqual({ kind: 'details-required' })
  })

  it.each([
    AppErrorCode.DELIVERY_OFFICE_NOT_FOUND,
    AppErrorCode.DELIVERY_OFFICE_REFUSED,
    AppErrorCode.DELIVERY_ADDRESS_REFUSED,
    AppErrorCode.DELIVERY_ADDRESS_NOT_SERVED,
    AppErrorCode.DELIVERY_LOCKER_INELIGIBLE,
  ])('points at the delivery panel on %s', (code) => {
    expect(placeOrderFailureOf(new ApiError(422, code), SENT)).toEqual({ kind: 'delivery' })
  })

  it('asks to wait when throttled', () => {
    expect(placeOrderFailureOf(new ApiError(429, AppErrorCode.RATE_LIMITED), SENT)).toEqual({
      kind: 'rate-limited',
    })
  })

  it('waits for a fresh bot check when its token was refused', () => {
    expect(placeOrderFailureOf(new ApiError(400, AppErrorCode.BOT_CHECK_FAILED), SENT)).toEqual({
      kind: 'bot-check',
    })
  })

  // An outage — ours, the courier's or the network's — is worth the same click again.
  it.each([
    new ApiError(503, AppErrorCode.INVENTORY_UNAVAILABLE),
    new ApiError(503, AppErrorCode.DELIVERY_UNAVAILABLE),
    new ApiError(500, AppErrorCode.INTERNAL_ERROR),
    new TypeError('Failed to fetch'),
  ])('offers a retry on %p', (error) => {
    expect(placeOrderFailureOf(error, SENT)).toEqual({ kind: 'retry' })
  })
})

describe('isFailureCurrent', () => {
  const SENT: PlaceOrderRequestDto = placeOrderRequestOf(input())!

  it('keeps a delivery refusal while the refused office is still chosen', () => {
    expect(isFailureCurrent({ kind: 'delivery' }, SENT, input())).toBe(true)
  })

  it.each<[string, Partial<PlaceOrderInput>]>([
    ['another office', { officeCode: '2000' }],
    ['an address', { method: 'courier-address', officeCode: null, address: ADDRESS }],
    ['a store pickup', { method: 'store-pickup', officeCode: null }],
  ])('drops a delivery refusal once %s is chosen', (_, overrides) => {
    expect(isFailureCurrent({ kind: 'delivery' }, SENT, input(overrides))).toBe(false)
  })

  // The new total arriving is what the notice is waiting for, not a reason to hide it.
  it('keeps a price change while the total is re-read', () => {
    const repriced = input({ money: { ...QUOTED, total: 5600 } })

    expect(isFailureCurrent({ kind: 'price-changed', shownTotal: 5304 }, SENT, repriced)).toBe(true)
  })

  it.each(['cart-stale', 'unavailable', 'rate-limited', 'bot-check', 'retry'] as const)(
    'keeps a %s refusal until the next attempt',
    (kind) => {
      expect(isFailureCurrent({ kind }, SENT, input({ officeCode: '2000' }))).toBe(true)
    },
  )
})
