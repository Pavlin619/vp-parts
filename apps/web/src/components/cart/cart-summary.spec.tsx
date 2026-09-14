import { render, screen } from '@testing-library/react'
import type { CartTotals } from '@/lib/cart/cart-totals'
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
    render(<CartSummary totals={totals()} isPending={false} />)

    expect(screen.getByText('70,00 €')).toBeInTheDocument()
    expect(screen.getByText('14,00 €')).toBeInTheDocument()
    expect(screen.getByText('84,00 €')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('warns when the figures cover only part of the cart', () => {
    render(
      <CartSummary totals={totals({ hasUnpricedLines: true })} isPending={false} />,
    )

    expect(
      screen.getByText('Сумата не включва артикулите без актуална цена.'),
    ).toBeInTheDocument()
  })

  it('holds the warning back while the prices are still being read', () => {
    render(
      <CartSummary totals={totals({ hasUnpricedLines: true })} isPending />,
    )

    expect(screen.queryByText(/без актуална цена/)).not.toBeInTheDocument()
    expect(screen.queryByText('84,00 €')).not.toBeInTheDocument()
  })

  // A part we cannot ship is quoted at our own catalogue price, so it reaches
  // the summary priced. Saying the total leaves it out is the only honest way
  // to show a figure at all.
  it('says the total leaves out the lines that cannot be ordered', () => {
    render(
      <CartSummary totals={totals({ hasBlockedLines: true })} isPending={false} />,
    )

    expect(
      screen.getByText('Сумата не включва артикулите с недостатъчна наличност.'),
    ).toBeInTheDocument()
  })

  it('holds the blocked warning back while the read is in flight', () => {
    render(<CartSummary totals={totals({ hasBlockedLines: true })} isPending />)

    expect(
      screen.queryByText(/недостатъчна наличност/),
    ).not.toBeInTheDocument()
  })

  // Delivery and payment are step two and do not exist yet.
  it('leaves the next step unreachable', () => {
    render(<CartSummary totals={totals()} isPending={false} />)

    expect(
      screen.getByRole('button', { name: /Към доставка и плащане/ }),
    ).toBeDisabled()
  })

  it('keeps the next step unreachable while a line cannot be ordered', () => {
    render(
      <CartSummary totals={totals({ hasBlockedLines: true })} isPending={false} />,
    )

    expect(
      screen.getByRole('button', { name: /Към доставка и плащане/ }),
    ).toBeDisabled()
  })
})
