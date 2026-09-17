import { render, screen } from '@testing-library/react'
import type { CartTotals } from '@/lib/cart/cart-totals'
import type { DeliveryPromise } from '@/lib/delivery/promise'
import { CartSummary } from './cart-summary'

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

describe('CartSummary', () => {
  it('breaks the total into net, VAT and gross', () => {
    render(<CartSummary totals={totals()} isPending={false} promise={null} />)

    expect(screen.getByText('70,00 €')).toBeInTheDocument()
    expect(screen.getByText('14,00 €')).toBeInTheDocument()
    expect(screen.getByText('84,00 €')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('warns when the figures cover only part of the cart', () => {
    render(
      <CartSummary
        totals={totals({ hasUnpricedLines: true })}
        isPending={false}
        promise={null}
      />,
    )

    expect(
      screen.getByText('Сумата не включва артикулите без актуална цена.'),
    ).toBeInTheDocument()
  })

  it('holds the warning back while the prices are still being read', () => {
    render(
      <CartSummary totals={totals({ hasUnpricedLines: true })} isPending promise={null} />,
    )

    expect(screen.queryByText(/без актуална цена/)).not.toBeInTheDocument()
    expect(screen.queryByText('84,00 €')).not.toBeInTheDocument()
  })

  // A part we cannot ship is quoted at our own catalogue price, so it reaches
  // the summary priced. Saying the total leaves it out is the only honest way
  // to show a figure at all.
  it('says the total leaves out the lines that cannot be ordered', () => {
    render(
      <CartSummary
        totals={totals({ hasBlockedLines: true })}
        isPending={false}
        promise={null}
      />,
    )

    expect(
      screen.getByText('Сумата не включва артикулите с недостатъчна наличност.'),
    ).toBeInTheDocument()
  })

  it('holds the blocked warning back while the read is in flight', () => {
    render(<CartSummary totals={totals({ hasBlockedLines: true })} isPending promise={null} />)

    expect(
      screen.queryByText(/недостатъчна наличност/),
    ).not.toBeInTheDocument()
  })

  // Delivery and payment are step two and do not exist yet.
  it('leaves the next step unreachable', () => {
    render(<CartSummary totals={totals()} isPending={false} promise={null} />)

    expect(
      screen.getByRole('button', { name: /Към доставка и плащане/ }),
    ).toBeDisabled()
  })

  it('keeps the next step unreachable while a line cannot be ordered', () => {
    render(
      <CartSummary
        totals={totals({ hasBlockedLines: true })}
        isPending={false}
        promise={null}
      />,
    )

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

    render(
      <CartSummary totals={totals()} isPending={false} promise={promise} />,
    )

    const panel = screen.getByTestId('delivery-cutoff-promise')
    expect(panel).toHaveTextContent('Готова за вземане днес?')
    expect(panel).toHaveTextContent('до 11:00 ч. от Централен склад')
    expect(panel).toHaveTextContent(/куриер добавя 1 работен ден/)

    jest.useRealTimers()
  })

  it('shows no deadline when the basket has none to promise', () => {
    render(<CartSummary totals={totals()} isPending={false} promise={null} />)

    expect(
      screen.queryByTestId('delivery-cutoff-promise'),
    ).not.toBeInTheDocument()
  })
})
