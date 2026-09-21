import { AVAILABILITY_MAX_ARTICLES, type CartDto } from '@vp-parts-shop/shared'
import { MAX_QUANTITY } from '@/lib/delivery/availability'
import * as cartApi from '@/lib/api/cart'
import { ApiError } from '@/lib/api'
import {
  MAX_CART_LINES,
  useCart,
  type CartLine,
  type CartLineArticle,
} from './use-cart'

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

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    ...article(),
    quantity: 1,
    isSelected: true,
    addedAtPriceIncVat: null,
    ...overrides,
  }
}

/** A server answer that simply echoes what the store already shows. */
function echoed(version = 1): CartDto {
  return {
    id: 'cart-1',
    version,
    lines: useCart.getState().lines.map((entry) => ({
      ...entry,
      addedAt: '2026-09-01T10:00:00.000Z',
    })),
  }
}

/** Fills the cart to its line limit with distinct parts. */
function fillCart(): void {
  useCart.setState({
    lines: Array.from({ length: MAX_CART_LINES }, (_, index) =>
      line({ articleNumber: `A${index}` }),
    ),
  })
}

/** Lets the serialised write chain drain. */
const settle = () => useCart.getState().whenSettled()

describe('useCart', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useCart.setState({ lines: [], cartId: '', version: 0, lastWriteError: null })
    api.addCartLine.mockImplementation(() => Promise.resolve(echoed()))
    api.updateCartLine.mockImplementation(() => Promise.resolve(echoed()))
    api.removeCartLine.mockImplementation(() => Promise.resolve(echoed()))
    api.setCartSelection.mockImplementation(() => Promise.resolve(echoed()))
    api.clearCart.mockImplementation(() => Promise.resolve(echoed()))
    api.getCart.mockImplementation(() => Promise.resolve(echoed()))
    api.readCartToken.mockReturnValue('a-cart-token')
  })

  describe('what the shopper sees immediately', () => {
    it('adds a part as a new line before the server answers', () => {
      useCart.getState().addLine(article(), 2)

      expect(useCart.getState().lines).toEqual([
        { ...article(), quantity: 2, isSelected: true, addedAtPriceIncVat: null },
      ])
    })

    it('raises the existing line instead of adding a second one', () => {
      useCart.getState().addLine(article(), 2)
      useCart.getState().addLine(article(), 3)

      expect(useCart.getState().lines).toHaveLength(1)
      expect(useCart.getState().lines[0].quantity).toBe(5)
    })

    // Two suppliers file the same article number for different parts, so the
    // number alone would merge one company's part into the other's line.
    it('keeps the same number from two brands as separate lines', () => {
      useCart.getState().addLine(article({ brandId: '268' }), 1)
      useCart.getState().addLine(article({ brandId: '77', brandName: 'BOSCH' }), 1)

      expect(useCart.getState().lines).toHaveLength(2)
    })

    it('caps a line at the absolute quantity ceiling', () => {
      useCart.getState().addLine(article(), MAX_QUANTITY)
      useCart.getState().addLine(article(), 10)

      expect(useCart.getState().lines[0].quantity).toBe(MAX_QUANTITY)
    })

    it('never lets a quantity fall below one', () => {
      useCart.getState().addLine(article(), 1)
      useCart.getState().setQuantity(article(), 0)

      expect(useCart.getState().lines[0].quantity).toBe(1)
    })

    it('sets a line quantity outright', () => {
      useCart.getState().addLine(article(), 1)
      useCart.getState().setQuantity(article(), 4)

      expect(useCart.getState().lines[0].quantity).toBe(4)
    })

    it('removes only the line asked for', () => {
      useCart.getState().addLine(article(), 1)
      useCart.getState().addLine(article({ articleNumber: 'OC90' }), 1)
      useCart.getState().removeLine(article())

      expect(useCart.getState().lines.map((entry) => entry.articleNumber)).toEqual([
        'OC90',
      ])
    })

    it('deselects a line without removing it', () => {
      useCart.getState().addLine(article(), 1)
      useCart.getState().toggleLineSelected(article())

      expect(useCart.getState().lines).toHaveLength(1)
      expect(useCart.getState().lines[0].isSelected).toBe(false)
    })

    it('selects and deselects every line at once', () => {
      useCart.getState().addLine(article(), 1)
      useCart.getState().addLine(article({ articleNumber: 'OC90' }), 1)

      useCart.getState().setAllLinesSelected(false)
      expect(useCart.getState().lines.every((entry) => !entry.isSelected)).toBe(true)

      useCart.getState().setAllLinesSelected(true)
      expect(useCart.getState().lines.every((entry) => entry.isSelected)).toBe(true)
    })

    // Adding a part is a statement that it is wanted.
    it('re-selects a deselected line when the part is added again', () => {
      useCart.getState().addLine(article(), 1)
      useCart.getState().toggleLineSelected(article())
      useCart.getState().addLine(article(), 1)

      expect(useCart.getState().lines[0].isSelected).toBe(true)
      expect(useCart.getState().lines[0].quantity).toBe(2)
    })

    it('empties the cart', () => {
      useCart.getState().addLine(article(), 1)
      useCart.getState().clear()

      expect(useCart.getState().lines).toEqual([])
    })
  })

  describe('toggling a line no longer in the mirror', () => {
    it('does nothing when the line has already been removed', async () => {
      useCart.setState({ lines: [] })

      useCart.getState().toggleLineSelected(article())
      await settle()

      expect(useCart.getState().lines).toEqual([])
      expect(api.updateCartLine).not.toHaveBeenCalled()
    })
  })

  describe('removing a line with a write still queued for it', () => {
    it('cancels a still-debounced quantity change', async () => {
      useCart.setState({ lines: [line()] })

      useCart.getState().setQuantity(article(), 5)
      useCart.getState().removeLine(article())
      await settle()

      expect(api.updateCartLine).not.toHaveBeenCalled()
      expect(api.removeCartLine).toHaveBeenCalledWith({
        brandId: '268',
        articleNumber: 'WL6340',
      })
    })
  })

  describe('writing through to the server', () => {
    it('sends the add with the price the shopper was looking at', async () => {
      useCart.getState().addLine(article(), 2, 4500)
      await settle()

      expect(api.addCartLine).toHaveBeenCalledWith({
        ...article(),
        quantity: 2,
        addedAtPriceIncVat: 4500,
      })
    })

    it('sends a quantity change as a patch on that line alone', async () => {
      useCart.setState({ lines: [line()] })
      useCart.getState().setQuantity(article(), 7)
      await settle()

      expect(api.updateCartLine).toHaveBeenCalledWith(
        { brandId: '268', articleNumber: 'WL6340' },
        { quantity: 7 },
      )
    })

    // Holding the stepper would otherwise be one write per press.
    it('collapses a burst of quantity changes into the last one', async () => {
      useCart.setState({ lines: [line()] })
      useCart.getState().setQuantity(article(), 2)
      useCart.getState().setQuantity(article(), 3)
      useCart.getState().setQuantity(article(), 4)
      await settle()

      expect(api.updateCartLine).toHaveBeenCalledTimes(1)
      expect(api.updateCartLine).toHaveBeenCalledWith(expect.anything(), {
        quantity: 4,
      })
    })

    it('keeps changes to different lines apart while collapsing each', async () => {
      useCart.setState({
        lines: [line(), line({ articleNumber: 'OC90' })],
      })
      useCart.getState().setQuantity(article(), 2)
      useCart.getState().setQuantity(article({ articleNumber: 'OC90' }), 5)
      await settle()

      expect(api.updateCartLine).toHaveBeenCalledTimes(2)
    })

    it('sends a selection toggle as a patch', async () => {
      useCart.setState({ lines: [line()] })
      useCart.getState().toggleLineSelected(article())
      await settle()

      expect(api.updateCartLine).toHaveBeenCalledWith(expect.anything(), {
        isSelected: false,
      })
    })

    it('sends a removal', async () => {
      useCart.setState({ lines: [line()] })
      useCart.getState().removeLine(article())
      await settle()

      expect(api.removeCartLine).toHaveBeenCalledWith({
        brandId: '268',
        articleNumber: 'WL6340',
      })
    })

    it('adopts the version the server answered with', async () => {
      api.addCartLine.mockResolvedValue({ id: 'cart-9', version: 12, lines: [] })
      useCart.getState().addLine(article(), 1)
      await settle()

      expect(useCart.getState().cartId).toBe('cart-9')
      expect(useCart.getState().version).toBe(12)
    })

    // One request at a time, so a slow add cannot land after the removal that
    // followed it and resurrect the line.
    it('sends the writes in the order they were made', async () => {
      const order: string[] = []
      api.addCartLine.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        order.push('add')
        return echoed()
      })
      api.removeCartLine.mockImplementation(() => {
        order.push('remove')
        return Promise.resolve(echoed())
      })

      useCart.getState().addLine(article(), 1)
      useCart.getState().removeLine(article())
      await settle()

      expect(order).toEqual(['add', 'remove'])
    })
  })

  describe('when the server refuses', () => {
    it('falls back to what the server actually holds', async () => {
      api.addCartLine.mockRejectedValue(new ApiError(409, 'CART_FULL'))
      api.getCart.mockResolvedValue({
        id: 'cart-1',
        version: 4,
        lines: [
          {
            ...article({ articleNumber: 'ALREADY-THERE' }),
            quantity: 1,
            isSelected: true,
            addedAtPriceIncVat: null,
            addedAt: '2026-09-01T10:00:00.000Z',
          },
        ],
      })

      useCart.setState({ cartId: 'cart-1' })

      useCart.getState().addLine(article(), 1)
      await settle()

      expect(useCart.getState().lines.map((entry) => entry.articleNumber)).toEqual([
        'ALREADY-THERE',
      ])
    })

    it('names a refused add as the reason a write failed', async () => {
      useCart.setState({ cartId: 'cart-1' })
      api.addCartLine.mockRejectedValue(new ApiError(409, 'CART_FULL'))

      useCart.getState().addLine(article(), 1)
      await settle()

      expect(useCart.getState().lastWriteError).toEqual({ code: 'CART_FULL' })
    })

    it('names a line the server no longer holds as the reason a write failed', async () => {
      useCart.setState({ cartId: 'cart-1', lines: [line()] })
      api.updateCartLine.mockRejectedValue(
        new ApiError(404, 'CART_ITEM_NOT_FOUND'),
      )

      useCart.getState().setQuantity(article(), 2)
      await settle()

      expect(useCart.getState().lastWriteError).toEqual({
        code: 'CART_ITEM_NOT_FOUND',
      })
    })

    it('reports every other rejection as a generic failure', async () => {
      useCart.setState({ cartId: 'cart-1' })
      api.addCartLine.mockRejectedValue(new ApiError(500, 'VALIDATION_ERROR'))

      useCart.getState().addLine(article(), 1)
      await settle()

      expect(useCart.getState().lastWriteError).toEqual({ code: 'OFFLINE' })
    })

    it('reports a failure it could not even re-read past', async () => {
      useCart.setState({ cartId: 'cart-1' })
      api.addCartLine.mockRejectedValue(new Error('offline'))
      api.getCart.mockRejectedValue(new Error('offline'))

      useCart.getState().addLine(article(), 1)
      await settle()

      expect(useCart.getState().lastWriteError).toEqual({ code: 'OFFLINE' })
    })

    // No cart was ever minted, so a read would answer "empty" from the missing
    // token rather than from the server, and quietly undo the failed click.
    it('does not read an empty cart back over a failed first add', async () => {
      api.addCartLine.mockRejectedValue(new Error('offline'))
      api.readCartToken.mockReturnValue(null)

      useCart.getState().addLine(article(), 1)
      await settle()

      expect(api.getCart).not.toHaveBeenCalled()
      expect(useCart.getState().lines).toHaveLength(1)
      expect(useCart.getState().lastWriteError).toEqual({ code: 'OFFLINE' })
    })

    // The cart token can be evicted (Safari ITP, a cleared storage) while the
    // persisted `cartId` survives. Re-reading in that state would not reach the
    // server at all — `getCart` answers "empty" from the missing token alone —
    // so it must be treated exactly like a failed first write.
    it('does not read an empty cart back when the token is gone but the cart id remains', async () => {
      useCart.setState({ cartId: 'cart-1', lines: [line()] })
      api.addCartLine.mockRejectedValue(new Error('offline'))
      api.readCartToken.mockReturnValue(null)

      useCart.getState().addLine(article({ articleNumber: 'NEW-PART' }), 1)
      await settle()

      expect(api.getCart).not.toHaveBeenCalled()
      expect(useCart.getState().lines).toHaveLength(2)
      expect(useCart.getState().lastWriteError).toEqual({ code: 'OFFLINE' })
    })

    it('keeps the optimistic line on screen when it cannot re-read', async () => {
      useCart.setState({ cartId: 'cart-1' })
      api.addCartLine.mockRejectedValue(new Error('offline'))
      api.getCart.mockRejectedValue(new Error('offline'))

      useCart.getState().addLine(article(), 1)
      await settle()

      expect(useCart.getState().lines).toHaveLength(1)
    })

    it('clears the failure once a later write succeeds', async () => {
      useCart.setState({
        cartId: 'cart-1',
        lastWriteError: { code: 'CART_FULL' },
      })
      api.removeCartLine.mockResolvedValue(echoed())

      useCart.getState().removeLine(article())
      await settle()

      expect(useCart.getState().lastWriteError).toBeNull()
    })
  })

  describe('dismissWriteError', () => {
    it('clears the failure without waiting for another write', () => {
      useCart.setState({ lastWriteError: { code: 'CART_FULL' } })

      useCart.getState().dismissWriteError()

      expect(useCart.getState().lastWriteError).toBeNull()
    })
  })

  describe('adopting a server cart', () => {
    it('replaces the lines wholesale', () => {
      useCart.setState({ lines: [line()] })

      useCart.getState().adoptServerCart({
        id: 'cart-2',
        version: 9,
        lines: [
          {
            ...article({ articleNumber: 'FROM-SERVER' }),
            quantity: 3,
            isSelected: false,
            addedAtPriceIncVat: 1200,
            addedAt: '2026-09-01T10:00:00.000Z',
          },
        ],
      })

      expect(useCart.getState().lines).toEqual([
        {
          ...article({ articleNumber: 'FROM-SERVER' }),
          quantity: 3,
          isSelected: false,
          addedAtPriceIncVat: 1200,
        },
      ])
      expect(useCart.getState().version).toBe(9)
    })

    // A response that crossed with a newer one would otherwise rewind the cart.
    it('ignores an answer older than the one already adopted', () => {
      useCart.getState().adoptServerCart({ id: 'cart-1', version: 5, lines: [] })
      useCart.getState().adoptServerCart({
        id: 'cart-1',
        version: 3,
        lines: [{ ...line(), addedAt: '2026-09-01T10:00:00.000Z' }],
      })

      expect(useCart.getState().version).toBe(5)
      expect(useCart.getState().lines).toEqual([])
    })

    it('takes an answer for a different cart whatever its version', () => {
      useCart.getState().adoptServerCart({ id: 'cart-1', version: 5, lines: [] })
      useCart.getState().adoptServerCart({
        id: 'cart-2',
        version: 1,
        lines: [{ ...line(), addedAt: '2026-09-01T10:00:00.000Z' }],
      })

      expect(useCart.getState().cartId).toBe('cart-2')
      expect(useCart.getState().lines).toHaveLength(1)
    })
  })

  // Every line is priced by one batch availability request, and the endpoint
  // refuses a batch over its cap — so a cart past it prices nothing at all.
  describe('the line limit', () => {
    it('matches the availability batch the cart is priced by', () => {
      expect(MAX_CART_LINES).toBe(AVAILABILITY_MAX_ARTICLES)
    })

    it('refuses a new line once the cart is full', () => {
      fillCart()
      useCart.getState().addLine(article({ articleNumber: 'ONE-TOO-MANY' }), 1)

      expect(useCart.getState().lines).toHaveLength(MAX_CART_LINES)
      expect(api.addCartLine).not.toHaveBeenCalled()
    })

    it('names the cart as full without a round trip', () => {
      fillCart()
      useCart.getState().addLine(article({ articleNumber: 'ONE-TOO-MANY' }), 1)

      expect(useCart.getState().lastWriteError).toEqual({ code: 'CART_FULL' })
    })

    // The limit counts lines, not pieces: topping up a part already in the cart
    // adds nothing to the batch, so a full cart must not block it.
    it('still raises a line already in a full cart', () => {
      fillCart()
      useCart.getState().addLine(article({ articleNumber: 'A0' }), 3)

      const raised = useCart
        .getState()
        .lines.find((entry) => entry.articleNumber === 'A0')

      expect(useCart.getState().lines).toHaveLength(MAX_CART_LINES)
      expect(raised?.quantity).toBe(4)
    })

    it('takes a new line again once one is removed', () => {
      fillCart()
      useCart.getState().removeLine(article({ articleNumber: 'A0' }))
      useCart.getState().addLine(article({ articleNumber: 'ROOM-NOW' }), 1)

      expect(useCart.getState().lines).toHaveLength(MAX_CART_LINES)
      expect(
        useCart.getState().lines.some((entry) => entry.articleNumber === 'ROOM-NOW'),
      ).toBe(true)
    })
  })

  describe('hasPendingWrite', () => {
    it('is true while a write is in flight and false once it settles', async () => {
      let resolveAdd!: (cart: CartDto) => void
      api.addCartLine.mockReturnValue(
        new Promise((resolve) => {
          resolveAdd = resolve
        }),
      )

      useCart.getState().addLine(article(), 1)
      expect(useCart.getState().hasPendingWrite()).toBe(true)

      resolveAdd(echoed())
      await settle()

      expect(useCart.getState().hasPendingWrite()).toBe(false)
    })

    it('is true while a quantity change is still debounced', async () => {
      useCart.setState({ lines: [line()] })

      useCart.getState().setQuantity(article(), 5)
      expect(useCart.getState().hasPendingWrite()).toBe(true)

      await settle()
      expect(useCart.getState().hasPendingWrite()).toBe(false)
    })
  })

  describe('canAddLine', () => {
    it('allows a new part while there is room', () => {
      expect(useCart.getState().canAddLine(article())).toBe(true)
    })

    it('refuses a new part once the cart is full', () => {
      fillCart()

      expect(useCart.getState().canAddLine(article({ articleNumber: 'NEW' }))).toBe(
        false,
      )
    })

    it('allows a part already in a full cart, since it adds no line', () => {
      fillCart()

      expect(useCart.getState().canAddLine(article({ articleNumber: 'A0' }))).toBe(
        true,
      )
    })
  })
})

// The detail page hands add-to-cart its whole article DTO, and structural
// typing lets everything on it through — images, specs, OE numbers.
describe('a caller that hands over more than a line needs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useCart.setState({ lines: [], cartId: '', version: 0, lastWriteError: null })
    api.addCartLine.mockImplementation(() => Promise.resolve(echoed()))
  })

  const overfull = {
    ...article(),
    images: ['https://example.test/a.jpg'],
    oemNumbers: ['1K0 615 301 A'],
    technicalSpecs: [{ name: 'Диаметър', value: '280' }],
  } as CartLineArticle

  it('stores only the fields a cart line is made of', () => {
    useCart.getState().addLine(overfull, 1)

    expect(useCart.getState().lines[0]).toEqual({
      ...article(),
      quantity: 1,
      isSelected: true,
      addedAtPriceIncVat: null,
    })
  })

  it('sends only those fields to the server', async () => {
    useCart.getState().addLine(overfull, 1, 2500)
    await settle()

    expect(api.addCartLine).toHaveBeenCalledWith({
      ...article(),
      quantity: 1,
      addedAtPriceIncVat: 2500,
    })
  })
})
