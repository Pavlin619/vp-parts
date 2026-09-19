import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CartLine } from '@/hooks/use-cart'
import type { CartRowModel } from '@/lib/cart/cart-totals'
import { CartDrawerRow } from './cart-drawer-row'

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    brandId: '268',
    articleNumber: 'WL6340',
    brandName: 'WIX',
    brandLogoUrl: null,
    description: 'Маслен филтър',
    thumbnailUrl: null,
    quantity: 1,
    isSelected: true,
    ...overrides,
  }
}

function row(overrides: Partial<CartRowModel> = {}): CartRowModel {
  return {
    line: line(),
    availability: {
      available: true,
      bestPriceExVat: 1000,
      bestPriceIncVat: 1200,
      availabilityByWarehouse: [],
      computedAt: null,
    },
    unitPriceExVat: 1000,
    unitPriceIncVat: 1200,
    lineTotalExVat: 1000,
    lineTotalIncVat: 1200,
    issue: null,
    availableQuantity: null,
    maxQuantity: 99,
    ...overrides,
  }
}

function renderRow(model: CartRowModel, handlers: Partial<{
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
}> = {}) {
  return render(
    <CartDrawerRow
      row={model}
      onQuantityChange={handlers.onQuantityChange ?? jest.fn()}
      onRemove={handlers.onRemove ?? jest.fn()}
    />,
  )
}

describe('CartDrawerRow', () => {
  it('names the part and links to its page', () => {
    renderRow(row())

    expect(screen.getByRole('link', { name: 'WL6340' })).toHaveAttribute(
      'href',
      '/catalog/articles/268/WL6340',
    )
    expect(screen.getByText('Маслен филтър')).toBeInTheDocument()
    expect(screen.getByText('WIX')).toBeInTheDocument()
  })

  it('shows the line total', () => {
    renderRow(row({ lineTotalIncVat: 3600, line: line({ quantity: 3 }) }))

    expect(screen.getByText('36,00 €')).toBeInTheDocument()
  })

  // The drawer is a quick look at what the cart holds, not a delivery quote.
  it('carries no delivery information', () => {
    renderRow(row())

    expect(screen.queryByText(/Доставка/)).not.toBeInTheDocument()
  })

  it('breaks a multi-piece line down to its unit price', () => {
    renderRow(row({ line: line({ quantity: 3 }), unitPriceIncVat: 1200 }))

    expect(screen.getByText('3 × 12,00 €')).toBeInTheDocument()
  })

  it('leaves a single piece without a unit-price breakdown', () => {
    renderRow(row())

    expect(screen.queryByText(/×/)).not.toBeInTheDocument()
  })

  it('skeletons the price while the availability read is in flight', () => {
    renderRow(
      row({ availability: undefined, unitPriceIncVat: null, lineTotalIncVat: null }),
    )

    expect(screen.getByTestId('cart-drawer-price-skeleton')).toBeInTheDocument()
  })

  // Never a zero: in a cart that reads as "free".
  it('dashes a price the read could not give', () => {
    renderRow(row({ availability: null, unitPriceIncVat: null, lineTotalIncVat: null }))

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('reports quantity changes', async () => {
    const onQuantityChange = jest.fn()
    const user = userEvent.setup()
    renderRow(row(), { onQuantityChange })

    await user.click(
      screen.getByRole('button', { name: 'Увеличи количеството за WL6340' }),
    )

    expect(onQuantityChange).toHaveBeenCalledWith(2)
  })

  it('reports removal', async () => {
    const onRemove = jest.fn()
    const user = userEvent.setup()
    renderRow(row(), { onRemove })

    await user.click(
      screen.getByRole('button', { name: 'Премахни WL6340 от кошницата' }),
    )

    expect(onRemove).toHaveBeenCalled()
  })

  it('says why a line cannot be ordered as it stands', () => {
    renderRow(
      row({
        line: line({ quantity: 4 }),
        issue: 'insufficient-stock',
        availableQuantity: 2,
      }),
    )

    expect(screen.getByText('Налични са само 2 бр.')).toBeInTheDocument()
  })

  it('marks a line the cart holds but the order leaves out', () => {
    renderRow(row({ line: line({ isSelected: false }) }))

    expect(screen.getByText('Не е избран')).toBeInTheDocument()
  })
})
