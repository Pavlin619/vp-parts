import { render, screen } from '@testing-library/react'
import type { CartRowModel } from '@/lib/cart/cart-totals'
import { OrderItemRow } from './order-item-row'

function row(overrides: Partial<CartRowModel> = {}): CartRowModel {
  return {
    line: {
      brandId: '268',
      articleNumber: 'WL6340',
      brandName: 'WIX',
      brandLogoUrl: null,
      description: 'Маслен филтър',
      thumbnailUrl: null,
      quantity: 2,
      isSelected: true,
      addedAtPriceIncVat: null,
    },
    availability: {
      available: true,
      bestPriceExVat: 1000,
      bestPriceIncVat: 1200,
      availabilityByWarehouse: [],
      computedAt: null,
    },
    unitPriceExVat: 1000,
    unitPriceIncVat: 1200,
    lineTotalExVat: 2000,
    lineTotalIncVat: 2400,
    issue: null,
    availableQuantity: null,
    maxQuantity: 99,
    priceChange: null,
    ...overrides,
  }
}

describe('OrderItemRow', () => {
  it('names the part, its quantity and the line total', () => {
    render(<OrderItemRow row={row()} />)

    expect(screen.getByText('WL6340')).toBeInTheDocument()
    expect(screen.getByText('Маслен филтър')).toBeInTheDocument()
    expect(screen.getByText('×2')).toBeInTheDocument()
    expect(screen.getByText('24,00 €')).toBeInTheDocument()
  })

  it('holds the price back while it is still being read', () => {
    render(
      <OrderItemRow
        row={row({ availability: undefined, lineTotalIncVat: null })}
      />,
    )

    expect(screen.getByTestId('order-item-price-skeleton')).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('shows a dash for a part the read could not price', () => {
    render(<OrderItemRow row={row({ lineTotalIncVat: null })} />)

    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
