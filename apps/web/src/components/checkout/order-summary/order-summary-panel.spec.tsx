import { render, screen } from '@testing-library/react'
import type { CartTotals } from '@/lib/cart/cart-totals'
import type { DeliverySummary } from '@/lib/checkout/delivery/delivery-summary'
import type { ParcelCheck } from '@/lib/checkout/delivery/office-availability'
import { OrderSummaryPanel } from './order-summary-panel'

function totals(overrides: Partial<CartTotals> = {}): CartTotals {
  return {
    itemCount: 3,
    subtotalExVat: 7000,
    vatAmount: 1400,
    totalIncVat: 8400,
    hasUnpricedLines: false,
    hasBlockedLines: false,
    ...overrides,
  }
}

const WEIGHED: ParcelCheck = {
  state: 'ready',
  parcel: { weightGrams: 2300, isLockerEligible: true },
}

function renderPanel(
  props: {
    totals?: CartTotals
    isPending?: boolean
    parcelCheck?: ParcelCheck
    delivery?: DeliverySummary
    isQuickOrder?: boolean
  } = {},
) {
  return render(
    <OrderSummaryPanel
      totals={props.totals ?? totals()}
      isPending={props.isPending ?? false}
      parcelCheck={props.parcelCheck ?? WEIGHED}
      delivery={props.delivery ?? { kind: 'awaiting-office' }}
      isQuickOrder={props.isQuickOrder ?? false}
    />,
  )
}

describe('OrderSummaryPanel', () => {
  it('breaks the goods into net, VAT and gross', () => {
    renderPanel()

    expect(screen.getByText('70,00 €')).toBeInTheDocument()
    expect(screen.getByText('14,00 €')).toBeInTheDocument()
    expect(screen.getByText('84,00 €')).toBeInTheDocument()
  })

  it('holds the money figures back while the prices are being read', () => {
    renderPanel({ isPending: true })

    expect(screen.queryByText('84,00 €')).not.toBeInTheDocument()
  })

  it('offers a disabled placeholder button until payment methods exist', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: /Поръчай сега/ })).toBeDisabled()
  })

  it('asks to request the order when it is a quick order', () => {
    renderPanel({ isQuickOrder: true })

    expect(screen.getByRole('button', { name: 'Заяви поръчка' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Поръчай сега/ })).not.toBeInTheDocument()
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
      expect(screen.getByText('84,00 €')).toBeInTheDocument()
      expect(screen.getByText('Без цената на доставката')).toBeInTheDocument()
    })

    it('holds the price and date back while it is being quoted', () => {
      renderPanel({ delivery: { kind: 'pending' } })

      expect(screen.getByText('Цена на доставката').nextSibling).not.toHaveTextContent(/€|—/)
      expect(screen.getByText('Очаквана доставка').nextSibling).not.toHaveTextContent(/—/)
    })

    it('shows the quoted price and date and adds it to the total', () => {
      renderPanel({
        delivery: {
          kind: 'quoted',
          priceIncVatCents: 714,
          expectedDeliveryDate: '2026-09-30',
        },
      })

      expect(screen.getByText('Цена на доставката').nextSibling).toHaveTextContent('7,14 €')
      expect(screen.getByText('Очаквана доставка').nextSibling).toHaveTextContent(
        'ср, 30 септември',
      )
      expect(screen.getByText('91,14 €')).toBeInTheDocument()
      expect(screen.queryByText('Без цената на доставката')).not.toBeInTheDocument()
    })

    it('shows a dash for the date when the carrier gave none', () => {
      renderPanel({
        delivery: { kind: 'quoted', priceIncVatCents: 714, expectedDeliveryDate: null },
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
        expect(screen.getByText('84,00 €')).toBeInTheDocument()
        expect(screen.queryByText('Без цената на доставката')).not.toBeInTheDocument()
      })

      it('shows a dash for the ready day when there is none to promise', () => {
        renderPanel({ delivery: { kind: 'pickup', readyAt: null } })

        expect(screen.getByText('Готова за вземане').nextSibling).toHaveTextContent('—')
      })
    })
  })
})
