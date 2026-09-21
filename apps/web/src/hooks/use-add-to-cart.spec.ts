import { act, renderHook, waitFor } from '@testing-library/react'
import type { CartDto } from '@vp-parts-shop/shared'
import * as cartApi from '@/lib/api/cart'
import { useAddToCart } from './use-add-to-cart'
import { MAX_CART_LINES, useCart, type CartLineArticle } from './use-cart'
import { useCartDrawer } from './use-cart-drawer'

jest.mock('@/lib/api/cart')

const api = jest.mocked(cartApi)

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

function cart(overrides: Partial<CartDto> = {}): CartDto {
  return { id: 'cart-1', version: 1, lines: [], ...overrides }
}

describe('useAddToCart', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useCart.setState({ lines: [], cartId: '', version: 0, lastWriteError: null })
    useCartDrawer.setState({ isOpen: false })
    api.addCartLine.mockResolvedValue(cart())
    api.readCartToken.mockReturnValue('a-cart-token')
  })

  it('adds the requested quantity', () => {
    const { result } = renderHook(() => useAddToCart())

    act(() => result.current.addToCart(article(), 3))

    expect(useCart.getState().lines).toEqual([
      expect.objectContaining({ articleNumber: 'WL6340', quantity: 3 }),
    ])
  })

  // Adding a part with no visible answer leaves the visitor guessing.
  it('shows the cart drawer', () => {
    const { result } = renderHook(() => useAddToCart())

    act(() => result.current.addToCart(article(), 1))

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
        addedAtPriceIncVat: null,
      })),
    })

    act(() => result.current.addToCart(article(), 1))

    expect(useCartDrawer.getState().isOpen).toBe(true)
  })

  // Disabling the button and showing a spinner for as long as this is true is
  // what closes the window where a second click, before this write's response
  // has named a cart, could mint a sibling cart nobody sees again.
  describe('isAddingToCart', () => {
    it('is true while the write is in flight and false once it settles', async () => {
      let resolveWrite!: (value: CartDto) => void;
      api.addCartLine.mockReturnValue(
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
      );
      const { result } = renderHook(() => useAddToCart())

      act(() => result.current.addToCart(article(), 1))
      expect(result.current.isAddingToCart).toBe(true)

      await act(async () => resolveWrite(cart()))

      await waitFor(() => expect(result.current.isAddingToCart).toBe(false))
    })

    // The store falls back to re-reading the cart rather than surfacing the
    // error — the button only needs to know the write is no longer pending.
    it('clears even when the write is refused', async () => {
      api.addCartLine.mockRejectedValue(new Error('cart is full'))
      api.getCart.mockResolvedValue(cart())
      const { result } = renderHook(() => useAddToCart())

      act(() => result.current.addToCart(article(), 1))
      expect(result.current.isAddingToCart).toBe(true)

      await waitFor(() => expect(result.current.isAddingToCart).toBe(false))
    })

    // Each call site renders its own hook instance, so one row's pending add
    // must never light up a different row's button.
    it('is local to this hook instance', async () => {
      let resolveWrite!: (value: CartDto) => void;
      api.addCartLine.mockReturnValue(
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
      );
      const rowA = renderHook(() => useAddToCart())
      const rowB = renderHook(() => useAddToCart())

      act(() => rowA.result.current.addToCart(article(), 1))

      expect(rowA.result.current.isAddingToCart).toBe(true)
      expect(rowB.result.current.isAddingToCart).toBe(false)

      await act(async () => resolveWrite(cart()))
    })
  })
})
