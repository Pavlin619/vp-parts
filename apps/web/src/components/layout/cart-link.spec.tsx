import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCart, type CartLineArticle } from '@/hooks/use-cart'
import { useCartDrawer } from '@/hooks/use-cart-drawer'
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
    useCartDrawer.setState({ isOpen: false })
  })

  it('leads to the cart', () => {
    render(<CartLink />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/cart')
  })

  // A glance at the cart should not cost the visitor their place in a list.
  it('opens the drawer instead of navigating on a plain click', async () => {
    const user = userEvent.setup()
    render(<CartLink />)

    await user.click(screen.getByRole('link'))

    expect(useCartDrawer.getState().isOpen).toBe(true)
  })

  // Opening the cart page in a new tab is the one thing the drawer cannot do.
  it('leaves a modified click to the browser', async () => {
    const user = userEvent.setup()
    render(<CartLink />)

    await user.keyboard('{Meta>}')
    await user.click(screen.getByRole('link'))
    await user.keyboard('{/Meta}')

    expect(useCartDrawer.getState().isOpen).toBe(false)
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
