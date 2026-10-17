import { render, screen } from '@testing-library/react'
import type { CartTotalsDto } from '@vp-parts-shop/shared'
import type { CartTotals } from '@/lib/cart/cart-totals'
import type { DeliveryPromise } from '@/lib/delivery/promise'
import { CartSummary } from './cart-summary'

function totals(overrides: Partial<CartTotals> = {}): CartTotals {
  return {
    itemCount: 3,
    hasUnpricedLines: false,
    hasBlockedLines: false,
    ...overrides,
  }
}

const MONEY: CartTotalsDto = {
  cartVersion: 3,
  goodsTotal: 8400,
  netAmount: 7000,
  vatAmount: 1400,
  total: 8400,
}

type SummaryProps = Parameters<typeof CartSummary>[0]

function renderSummary(props: Partial<SummaryProps> = {}) {
  return render(
    <CartSummary
      totals={totals()}
      money={MONEY}
      isMoneyFailed={false}
      isMoneyRecalculating={false}
      isPending={false}
      hasPrices
      promise={null}
      {...props}
    />,
  )
}

describe('CartSummary', () => {
  it('shows the net, the VAT and the total as the API priced them', () => {
    renderSummary()

    expect(screen.getByText('Сума без ДДС').nextSibling).toHaveTextContent('70,00 €')
    expect(screen.getByText('ДДС').nextSibling).toHaveTextContent('14,00 €')
    expect(screen.getByText('Общо с ДДС').nextSibling).toHaveTextContent('84,00 €')
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('holds the money back while it is being read', () => {
    renderSummary({ money: undefined })

    expect(screen.queryByText(/€/)).not.toBeInTheDocument()
  })

  // A quantity click is a new cart version; the last figures stand, dimmed, until it is priced.
  it('marks the money as recalculating while the next version is read', () => {
    renderSummary({ isMoneyRecalculating: true })

    expect(screen.getByText('Общо с ДДС').closest('dl')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Общо с ДДС').nextSibling).toHaveTextContent('84,00 €')
  })

  it('shows dashes when the money could not be read', () => {
    renderSummary({ money: undefined, isMoneyFailed: true })

    expect(screen.getByText('Общо с ДДС').nextSibling).toHaveTextContent('—')
  })

  it('warns when the figures cover only part of the cart', () => {
    renderSummary({ totals: totals({ hasUnpricedLines: true }) })

    expect(
      screen.getByText('Сумата не включва артикулите без актуална цена.'),
    ).toBeInTheDocument()
  })

  it('holds the warning back while the prices are still being read', () => {
    renderSummary({ totals: totals({ hasUnpricedLines: true }), isPending: true, hasPrices: false })

    expect(screen.queryByText(/без актуална цена/)).not.toBeInTheDocument()
  })

  // A part we cannot ship is quoted at our own catalogue price, so it reaches
  // the summary priced. Saying the total leaves it out is the only honest way
  // to show a figure at all.
  it('says the total leaves out the lines that cannot be ordered', () => {
    renderSummary({ totals: totals({ hasBlockedLines: true }) })

    expect(
      screen.getByText('Сумата не включва артикулите с недостатъчна наличност.'),
    ).toBeInTheDocument()
  })

  it('holds the blocked warning back while the read is in flight', () => {
    renderSummary({ totals: totals({ hasBlockedLines: true }), isPending: true, hasPrices: false })

    expect(
      screen.queryByText(/недостатъчна наличност/),
    ).not.toBeInTheDocument()
  })

  it('leads on to delivery and payment', () => {
    renderSummary()

    expect(
      screen.getByRole('link', { name: /Към доставка и плащане/ }),
    ).toHaveAttribute('href', '/checkout')
  })

  it('keeps the next step unreachable while the prices are being read', () => {
    renderSummary({ isPending: true, hasPrices: false })

    expect(
      screen.getByRole('button', { name: /Към доставка и плащане/ }),
    ).toBeDisabled()
  })

  it('keeps the next step unreachable when the prices could not be read', () => {
    renderSummary({ hasPrices: false })

    expect(
      screen.getByRole('button', { name: /Към доставка и плащане/ }),
    ).toBeDisabled()
  })

  it('keeps the next step unreachable with nothing selected', () => {
    renderSummary({ totals: totals({ itemCount: 0 }) })

    expect(
      screen.getByRole('button', { name: /Към доставка и плащане/ }),
    ).toBeDisabled()
  })

  it('keeps the next step unreachable while a line cannot be ordered', () => {
    renderSummary({ totals: totals({ hasBlockedLines: true }) })

    expect(
      screen.getByRole('button', { name: /Към доставка и плащане/ }),
    ).toBeDisabled()
  })

  // The nudge belongs to the whole basket, so it sits with the money it is
  // asking the customer to commit.
  it('prompts to order before the basket deadline', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-07-01T08:00:00.000Z'))

    const promise: DeliveryPromise = {
      cutoffAt: '2026-07-01T08:45:00.000Z',
      orderCutoffTime: '11:00',
      warehouseName: 'Централен склад',
      fulfilledAt: '2026-07-01T14:00:00.000Z',
      isPickup: true,
    }

    renderSummary({ promise })

    const panel = screen.getByTestId('delivery-cutoff-promise')
    expect(panel).toHaveTextContent('Готова за вземане днес?')
    expect(panel).toHaveTextContent('до 11:00 ч. от Централен склад')
    expect(panel).toHaveTextContent(/куриер добавя 1 работен ден/)

    jest.useRealTimers()
  })

  it('shows no deadline when the basket has none to promise', () => {
    renderSummary()

    expect(
      screen.queryByTestId('delivery-cutoff-promise'),
    ).not.toBeInTheDocument()
  })
})
