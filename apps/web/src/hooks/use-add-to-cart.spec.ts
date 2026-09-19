import { act, renderHook } from '@testing-library/react'
import { useAddToCart } from './use-add-to-cart'
import { MAX_CART_LINES, useCart, type CartLineArticle } from './use-cart'
import { useCartDrawer } from './use-cart-drawer'

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

describe('useAddToCart', () => {
  beforeEach(() => {
    useCart.setState({ lines: [] })
    useCartDrawer.setState({ isOpen: false })
  })

  it('adds the requested quantity', () => {
    const { result } = renderHook(() => useAddToCart())

    act(() => result.current(article(), 3))

    expect(useCart.getState().lines).toEqual([
      expect.objectContaining({ articleNumber: 'WL6340', quantity: 3 }),
    ])
  })

  // Adding a part with no visible answer leaves the visitor guessing.
  it('shows the cart drawer', () => {
    const { result } = renderHook(() => useAddToCart())

    act(() => result.current(article(), 1))

    expect(useCartDrawer.getState().isOpen).toBe(true)
  })

  // A full cart refuses the line; the drawer is then the only way to see why.
  it('shows the drawer even when the cart refuses the line', () => {
    const { result } = renderHook(() => useAddToCart())
    useCart.setState({
      lines: Array.from({ length: MAX_CART_LINES }, (_, index) => ({
        ...article({ articleNumber: `A${index}` }),
        quantity: 1,
        isSelected: true,
      })),
    })

    act(() => result.current(article(), 1))

    expect(useCartDrawer.getState().isOpen).toBe(true)
  })
})
