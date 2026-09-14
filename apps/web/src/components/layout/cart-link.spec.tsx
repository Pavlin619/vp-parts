import { render, screen } from '@testing-library/react'
import { useCart, type CartLineArticle } from '@/hooks/use-cart'
import { CartLink } from './cart-link'

function article(overrides: Partial<CartLineArticle> = {}): CartLineArticle {
  return {
    brandId: '268',
    articleNumber: 'WL6340',
    brandName: 'WIX',
    brandLogoUrl: null,
    description: 'Маслен филтър',
    thumbnailUrl: null,
    ...overrides,
  }
}

describe('CartLink', () => {
  beforeEach(() => {
    useCart.setState({ lines: [] })
  })

  it('leads to the cart', () => {
    render(<CartLink />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/cart')
  })

  it('shows no badge on an empty cart', () => {
    render(<CartLink />)

    expect(screen.getByRole('link', { name: 'Кошница' })).toBeInTheDocument()
  })

  it('counts the pieces in the cart, not the lines', () => {
    useCart.getState().addLine(article(), 2)
    useCart.getState().addLine(article({ articleNumber: 'OC90' }), 3)

    render(<CartLink />)

    expect(screen.getByText('5')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Кошница · 5 артикула' }),
    ).toBeInTheDocument()
  })

  // Past the cap the badge would outgrow the icon it sits on.
  it('caps the badge', () => {
    useCart.getState().addLine(article(), 99)
    useCart.getState().addLine(article({ articleNumber: 'OC90' }), 40)

    render(<CartLink />)

    expect(screen.getByText('99+')).toBeInTheDocument()
  })
})
