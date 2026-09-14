import { AVAILABILITY_MAX_ARTICLES } from '@vp-parts-shop/shared'
import { MAX_QUANTITY } from '@/lib/delivery/availability'
import { MAX_CART_LINES, useCart, type CartLineArticle } from './use-cart'

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

/** Fills the cart to its line limit with distinct parts. */
function fillCart(): void {
  for (let index = 0; index < MAX_CART_LINES; index += 1) {
    useCart.getState().addLine(article({ articleNumber: `A${index}` }), 1)
  }
}

describe('useCart', () => {
  beforeEach(() => {
    useCart.setState({ lines: [] })
  })

  it('adds a part as a new line', () => {
    useCart.getState().addLine(article(), 2)

    expect(useCart.getState().lines).toEqual([
      { ...article(), quantity: 2, isSelected: true },
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

    expect(useCart.getState().lines.map((line) => line.articleNumber)).toEqual([
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
    expect(useCart.getState().lines.every((line) => !line.isSelected)).toBe(true)

    useCart.getState().setAllLinesSelected(true)
    expect(useCart.getState().lines.every((line) => line.isSelected)).toBe(true)
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

  // Every line is priced by one batch availability request, and the endpoint
  // refuses a batch over its cap — so a cart past it prices nothing at all.
  describe('the line limit', () => {
    it('matches the availability batch the cart is priced by', () => {
      expect(MAX_CART_LINES).toBe(AVAILABILITY_MAX_ARTICLES)
    })

    it('fills right up to the limit', () => {
      fillCart()

      expect(useCart.getState().lines).toHaveLength(MAX_CART_LINES)
    })

    it('refuses a new line once the cart is full', () => {
      fillCart()
      useCart.getState().addLine(article({ articleNumber: 'ONE-TOO-MANY' }), 1)

      expect(useCart.getState().lines).toHaveLength(MAX_CART_LINES)
      expect(
        useCart.getState().lines.some((line) => line.articleNumber === 'ONE-TOO-MANY'),
      ).toBe(false)
    })

    // The limit counts lines, not pieces: topping up a part already in the cart
    // adds nothing to the batch, so a full cart must not block it.
    it('still raises a line already in a full cart', () => {
      fillCart()
      useCart.getState().addLine(article({ articleNumber: 'A0' }), 3)

      const line = useCart
        .getState()
        .lines.find((entry) => entry.articleNumber === 'A0')

      expect(useCart.getState().lines).toHaveLength(MAX_CART_LINES)
      expect(line?.quantity).toBe(4)
    })

    it('takes a new line again once one is removed', () => {
      fillCart()
      useCart.getState().removeLine(article({ articleNumber: 'A0' }))
      useCart.getState().addLine(article({ articleNumber: 'ROOM-NOW' }), 1)

      expect(useCart.getState().lines).toHaveLength(MAX_CART_LINES)
      expect(
        useCart.getState().lines.some((line) => line.articleNumber === 'ROOM-NOW'),
      ).toBe(true)
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
