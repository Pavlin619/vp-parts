import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentMethod } from '@vp-parts-shop/shared'
import type { PlaceOrder } from '@/hooks/use-place-order'
import {
  summaryMoney,
  type DeliverySummary,
  type SummaryMoney,
} from '@/lib/checkout/delivery/delivery-summary'
import type { ParcelCheck } from '@/lib/checkout/delivery/office-availability'
import { OrderSummaryPanel } from './order-summary-panel'

const GOODS = {
  cartVersion: 3,
  goodsTotal: 8400,
  netAmount: 7000,
  vatAmount: 1400,
  total: 8400,
}

const WEIGHED: ParcelCheck = {
  state: 'ready',
  parcel: { weightGrams: 2300, isLockerEligible: true },
}

function order(overrides: Partial<PlaceOrder> = {}): PlaceOrder {
  return {
    canPlace: false,
    isPlacing: false,
    isPlaced: false,
    failure: null,
    place: jest.fn(),
    ...overrides,
  }
}

function renderPanel(
  props: {
    money?: SummaryMoney | null
    isMoneyFailed?: boolean
    parcelCheck?: ParcelCheck
    delivery?: DeliverySummary
    isQuickOrder?: boolean
    paymentMethod?: PaymentMethod | null
    order?: PlaceOrder
  } = {},
) {
  const delivery = props.delivery ?? { kind: 'awaiting-office' }

  return render(
    <OrderSummaryPanel
      money={props.money === undefined ? summaryMoney(GOODS, delivery) : props.money}
      isMoneyFailed={props.isMoneyFailed ?? false}
      parcelCheck={props.parcelCheck ?? WEIGHED}
      delivery={delivery}
      isQuickOrder={props.isQuickOrder ?? false}
      paymentMethod={props.paymentMethod ?? null}
      order={props.order ?? order()}
    />,
  )
}

describe('OrderSummaryPanel', () => {
  it('shows the parts, the total and the VAT in it, as the API priced them', () => {
    renderPanel()

    expect(screen.getByText('Продукти').nextSibling).toHaveTextContent('84,00 €')
    expect(screen.getByText('Общо с ДДС').nextSibling).toHaveTextContent('84,00 €')
    expect(screen.getByText('в т.ч. ДДС').nextSibling).toHaveTextContent('14,00 €')
    expect(screen.getByText('Сума без ДДС').nextSibling).toHaveTextContent('70,00 €')
  })

  it('holds the money figures back while they are being read', () => {
    renderPanel({ money: null })

    expect(screen.queryByText('84,00 €')).not.toBeInTheDocument()
    expect(screen.getByText('Продукти').nextSibling).not.toHaveTextContent(/€|—/)
  })

  it('shows dashes when the money could not be read', () => {
    renderPanel({ money: null, isMoneyFailed: true })

    expect(screen.getByText('Продукти').nextSibling).toHaveTextContent('—')
    expect(screen.getByText('Общо с ДДС').nextSibling).toHaveTextContent('—')
  })

  describe('the order button', () => {
    // CRD Art. 8(2): the words must say that ordering means paying.
    it('says that ordering means paying', () => {
      renderPanel({ order: order({ canPlace: true }) })

      expect(
        screen.getByRole('button', { name: 'Купи сега' }),
      ).toBeEnabled()
      expect(screen.queryByRole('button', { name: /Поръчай сега/ })).not.toBeInTheDocument()
    })

    it('stays disabled until an order can be placed', () => {
      renderPanel()

      expect(
        screen.getByRole('button', { name: 'Купи сега' }),
      ).toBeDisabled()
    })

    it('places the order when clicked', async () => {
      const place = jest.fn()
      renderPanel({ order: order({ canPlace: true, place }) })

      await userEvent.click(screen.getByRole('button', { name: 'Купи сега' }))

      expect(place).toHaveBeenCalledTimes(1)
    })

    it('is busy and disabled while the order is being placed', () => {
      renderPanel({ order: order({ isPlacing: true }) })

      const button = screen.getByRole('button', { name: 'Купи сега' })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-busy', 'true')
    })

    it('links the terms, the withdrawal right and the privacy notice under it', () => {
      renderPanel()

      expect(screen.getByRole('link', { name: 'Общите условия' })).toHaveAttribute('href', '/terms')
      expect(screen.getByRole('link', { name: 'правото на отказ' })).toHaveAttribute(
        'href',
        '/withdrawal',
      )
      expect(
        screen.getByRole('link', { name: 'политиката за поверителност' }),
      ).toHaveAttribute('href', '/privacy')
    })

    // The guest is bound by the click as a customer is (ЗЗП чл. 49, ал. 2).
    it('places a quick order with the same words, under the same terms', async () => {
      const place = jest.fn()
      renderPanel({ isQuickOrder: true, order: order({ canPlace: true, place }) })

      await userEvent.click(screen.getByRole('button', { name: 'Купи сега' }))

      expect(place).toHaveBeenCalled()
      expect(screen.getByRole('link', { name: 'Общите условия' })).toBeInTheDocument()
    })
  })

  describe('a refused order', () => {
    it('says the price changed, from the total shown to the one read since', () => {
      renderPanel({
        money: { ...GOODS, total: 8700, isDeliveryIncluded: true },
        order: order({ failure: { kind: 'price-changed', shownTotal: 8400 } }),
      })

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Цената на поръчката е променена от 84,00 € на 87,00 €.',
      )
    })

    it('says the price changed before the new total has been read', () => {
      renderPanel({
        money: null,
        order: order({ failure: { kind: 'price-changed', shownTotal: 8400 } }),
      })

      expect(screen.getByRole('alert')).toHaveTextContent('Цената на поръчката е променена.')
    })

    it('sends the customer to the cart when a line can no longer be ordered', () => {
      renderPanel({ order: order({ failure: { kind: 'unavailable' } }) })

      expect(screen.getByRole('link', { name: 'Прегледайте кошницата' })).toHaveAttribute(
        'href',
        '/cart',
      )
    })

    it.each([
      ['cart-stale', /Кошницата беше променена/],
      ['details-required', /данните за контакт/],
      ['delivery', /друг офис или адрес/],
      ['rate-limited', /Изчакайте минута/],
      ['bot-check', /Изчакайте проверката за сигурност/],
      ['retry', /временен проблем/],
    ] as const)('explains %s', (kind, text) => {
      renderPanel({ order: order({ failure: { kind } }) })

      expect(screen.getByRole('alert')).toHaveTextContent(text)
    })
  })

  describe('weight', () => {
    it('shows the parcel weight', () => {
      renderPanel()

      expect(screen.getByText('Общо тегло').nextSibling).toHaveTextContent('2,3 кг')
    })

    it('holds it back while the parcel is being weighed', () => {
      renderPanel({ parcelCheck: { state: 'checking' } })

      expect(screen.getByText('Общо тегло').nextSibling).not.toHaveTextContent(/кг|—/)
    })

    it('shows a dash when the weighing failed', () => {
      renderPanel({ parcelCheck: { state: 'failed' } })

      expect(screen.getByText('Общо тегло').nextSibling).toHaveTextContent('—')
    })
  })

  describe('delivery', () => {
    it.each([
      [{ kind: 'not-quoted' }, '—'],
      [{ kind: 'awaiting-method' }, 'Изберете метод'],
      [{ kind: 'awaiting-office' }, 'Изберете офис'],
      [{ kind: 'office-unusable' }, 'Изберете друг офис'],
      [{ kind: 'awaiting-address' }, 'Въведете адрес'],
      [{ kind: 'address-unusable' }, 'Проверете адреса'],
      [{ kind: 'failed' }, 'Не може да се изчисли'],
    ] as const)('reads %j as "%s" and leaves the total to the goods', (delivery, text) => {
      renderPanel({ delivery })

      expect(screen.getByText('Цена на доставката').nextSibling).toHaveTextContent(text)
      expect(screen.getByText('Общо с ДДС').nextSibling).toHaveTextContent('84,00 €')
      expect(screen.getByText('Без цената на доставката')).toBeInTheDocument()
    })

    it('holds the price and date back while it is being quoted', () => {
      renderPanel({ delivery: { kind: 'pending' } })

      expect(screen.getByText('Цена на доставката').nextSibling).not.toHaveTextContent(/€|—/)
      expect(screen.getByText('Очаквана доставка').nextSibling).not.toHaveTextContent(/—/)
    })

    it('shows the quoted price and date, and the quote’s money with the VAT on delivery', () => {
      renderPanel({
        delivery: {
          kind: 'quoted',
          priceIncVatCents: 714,
          cashOnDeliveryFeeIncVatCents: null,
          expectedDeliveryDate: '2026-09-30',
          cartVersion: 3,
          money: {
            goodsTotal: 8400,
            deliveryPrice: 714,
            cashOnDeliveryFee: 0,
            total: 9114,
            netAmount: 7595,
            vatAmount: 1519,
          },
        },
      })

      expect(screen.getByText('Цена на доставката').nextSibling).toHaveTextContent('7,14 €')
      expect(screen.getByText('Очаквана доставка').nextSibling).toHaveTextContent(
        'ср, 30 септември',
      )
      expect(screen.getByText('Сума без ДДС').nextSibling).toHaveTextContent('75,95 €')
      expect(screen.getByText('в т.ч. ДДС').nextSibling).toHaveTextContent('15,19 €')
      expect(screen.getByText('91,14 €')).toBeInTheDocument()
      expect(screen.queryByText('Без цената на доставката')).not.toBeInTheDocument()
    })

    it('leaves the total to the goods while the quote carries no money', () => {
      renderPanel({
        delivery: {
          kind: 'quoted',
          priceIncVatCents: 714,
          cashOnDeliveryFeeIncVatCents: null,
          expectedDeliveryDate: '2026-09-30',
          cartVersion: 3,
          money: null,
        },
      })

      expect(screen.getByText('Общо с ДДС').nextSibling).toHaveTextContent('84,00 €')
      expect(screen.getByText('Без цената на доставката')).toBeInTheDocument()
    })

    it('shows a dash for the date when the carrier gave none', () => {
      renderPanel({
        delivery: {
          kind: 'quoted',
          priceIncVatCents: 714,
          cashOnDeliveryFeeIncVatCents: null,
          expectedDeliveryDate: null,
          cartVersion: 3,
          money: null,
        },
      })

      expect(screen.getByText('Очаквана доставка').nextSibling).toHaveTextContent('—')
    })

    describe('store pickup', () => {
      afterEach(() => {
        jest.useRealTimers()
      })

      it('costs nothing and says when the order is ready to collect', () => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2026-07-01T08:00:00.000Z'))

        renderPanel({ delivery: { kind: 'pickup', readyAt: '2026-07-02T06:00:00.000Z' } })

        expect(screen.getByText('Цена на доставката').nextSibling).toHaveTextContent('Безплатна')
        expect(screen.getByText('Готова за вземане').nextSibling).toHaveTextContent('утре')
        expect(screen.queryByText('Очаквана доставка')).not.toBeInTheDocument()
        expect(screen.getByText('Общо с ДДС').nextSibling).toHaveTextContent('84,00 €')
        expect(screen.queryByText('Без цената на доставката')).not.toBeInTheDocument()
      })

      it('shows a dash for the ready day when there is none to promise', () => {
        renderPanel({ delivery: { kind: 'pickup', readyAt: null } })

        expect(screen.getByText('Готова за вземане').nextSibling).toHaveTextContent('—')
      })
    })
  })

  describe('cash-on-delivery fee', () => {
    const QUOTED_WITH_FEE: DeliverySummary = {
      kind: 'quoted',
      priceIncVatCents: 714,
      cashOnDeliveryFeeIncVatCents: 152,
      expectedDeliveryDate: '2026-09-30',
      cartVersion: 3,
      money: {
        goodsTotal: 8400,
        deliveryPrice: 714,
        cashOnDeliveryFee: 152,
        total: 9266,
        netAmount: 7722,
        vatAmount: 1544,
      },
    }

    it('shows the fee apart from the delivery and adds it to the total', () => {
      renderPanel({ delivery: QUOTED_WITH_FEE, paymentMethod: PaymentMethod.CASH_ON_DELIVERY })

      expect(screen.getByText('Такса наложен платеж').nextSibling).toHaveTextContent('1,52 €')
      expect(screen.getByText('Цена на доставката').nextSibling).toHaveTextContent('7,14 €')
      expect(screen.getByText('92,66 €')).toBeInTheDocument()
    })

    it('charges it on a quick order, which is paid on delivery', () => {
      renderPanel({ delivery: QUOTED_WITH_FEE, isQuickOrder: true })

      expect(screen.getByText('Такса наложен платеж').nextSibling).toHaveTextContent('1,52 €')
    })

    it('holds it back while delivery is being quoted', () => {
      renderPanel({ delivery: { kind: 'pending' }, paymentMethod: PaymentMethod.CASH_ON_DELIVERY })

      expect(screen.getByText('Такса наложен платеж').nextSibling).not.toHaveTextContent(/€|—/)
    })

    it('shows a dash while delivery has no price', () => {
      renderPanel({
        delivery: { kind: 'awaiting-office' },
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      })

      expect(screen.getByText('Такса наложен платеж').nextSibling).toHaveTextContent('—')
    })

    it('has no fee when cash on delivery is not chosen', () => {
      renderPanel({ delivery: QUOTED_WITH_FEE, paymentMethod: PaymentMethod.CARD })

      expect(screen.queryByText('Такса наложен платеж')).not.toBeInTheDocument()
    })

    // Collected at the counter, not by a courier.
    it('has no fee for a store pickup', () => {
      renderPanel({
        delivery: { kind: 'pickup', readyAt: null },
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      })

      expect(screen.queryByText('Такса наложен платеж')).not.toBeInTheDocument()
    })
  })
})
