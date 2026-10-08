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
  } = {},
) {
  return render(
    <OrderSummaryPanel
      totals={props.totals ?? totals()}
      isPending={props.isPending ?? false}
      parcelCheck={props.parcelCheck ?? WEIGHED}
      delivery={props.delivery ?? { kind: 'awaiting-office' }}
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
      [{ kind: 'awaiting-office' }, 'Изберете офис'],
      [{ kind: 'office-unusable' }, 'Изберете друг офис'],
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
  })
})
