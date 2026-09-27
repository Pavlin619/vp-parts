import { render, screen } from '@testing-library/react'
import type { CartRowModel } from '@/lib/cart/cart-totals'
import { OrderItemsPanel } from './order-items-panel'

function row(articleNumber: string, quantity: number): CartRowModel {
  return {
    line: {
      brandId: '268',
      articleNumber,
      brandName: 'WIX',
      brandLogoUrl: null,
      description: 'Филтър',
      thumbnailUrl: null,
      quantity,
      isSelected: true,
      addedAtPriceIncVat: null,
    },
    availability: undefined,
    unitPriceExVat: null,
    unitPriceIncVat: null,
    lineTotalExVat: null,
    lineTotalIncVat: null,
    issue: null,
    availableQuantity: null,
    maxQuantity: 99,
    priceChange: null,
  }
}

describe('OrderItemsPanel', () => {
  it('lists every line and counts the pieces', () => {
    render(
      <OrderItemsPanel rows={[row('WL6340', 2), row('OC90', 1)]} itemCount={3} />,
    )

    expect(screen.getByRole('heading', { name: 'Артикули · 3' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('links back to the cart to change the order', () => {
    render(<OrderItemsPanel rows={[row('WL6340', 1)]} itemCount={1} />)

    expect(screen.getByRole('link', { name: 'Промени' })).toHaveAttribute(
      'href',
      '/cart',
    )
  })
})
