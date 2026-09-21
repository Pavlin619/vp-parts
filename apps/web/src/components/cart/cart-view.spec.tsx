import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  articleIdentityKey,
  type ArticleIdentityDto,
  type ArticlesAvailabilityDto,
  type CartDto,
} from '@vp-parts-shop/shared'
import * as cartApi from '@/lib/api/cart'
import { MAX_CART_LINES, useCart, type CartLineArticle } from '@/hooks/use-cart'
import { CartView } from './cart-view'

const getAvailability = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  availabilityQueryOptions: (articles: ArticleIdentityDto[]) => ({
    queryKey: [
      'catalog',
      'availability',
      articles
        .map((article) =>
          articleIdentityKey(article.brandId, article.articleNumber),
        )
        .sort()
        .join(','),
    ],
    queryFn: () => getAvailability(articles) as Promise<ArticlesAvailabilityDto>,
  }),
}))

// The cart writes through to the server; these cases are about what the page
// shows for a cart already in the mirror, not about that request. Each write
// is echoed straight back so it always lands, keeping the write-failure
// banner (see cart-write-error.spec.tsx) out of these cases.
jest.mock('@/lib/api/cart')

const cart = jest.mocked(cartApi)

function echoedCart(): CartDto {
  return {
    id: 'cart-1',
    version: 1,
    lines: useCart.getState().lines.map((entry) => ({
      ...entry,
      addedAt: '2026-09-01T10:00:00.000Z',
    })),
  }
}

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

function availabilityFor(item: CartLineArticle): ArticlesAvailabilityDto {
  return {
    [articleIdentityKey(item.brandId, item.articleNumber)]: {
      available: true,
      bestPriceExVat: 1000,
      bestPriceIncVat: 1200,
      availabilityByWarehouse: [],
      computedAt: null,
    },
  }
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <CartView />
    </QueryClientProvider>,
  )
}

describe('CartView', () => {
  beforeEach(() => {
    useCart.setState({ lines: [], lastWriteError: null })
    getAvailability.mockReset()
    getAvailability.mockResolvedValue({})

    cart.addCartLine.mockImplementation(() => Promise.resolve(echoedCart()))
    cart.updateCartLine.mockImplementation(() => Promise.resolve(echoedCart()))
    cart.removeCartLine.mockImplementation(() => Promise.resolve(echoedCart()))
    cart.setCartSelection.mockImplementation(() => Promise.resolve(echoedCart()))
    cart.clearCart.mockImplementation(() => Promise.resolve(echoedCart()))
  })

  it('offers a way back to the catalogue when the cart is empty', async () => {
    renderView()

    expect(await screen.findByText('Кошницата е празна')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Към каталога' })).toHaveAttribute(
      'href',
      '/catalog',
    )
  })

  it('counts the pieces in the cart, not the lines', async () => {
    useCart.getState().addLine(article(), 2)
    useCart.getState().addLine(article({ articleNumber: 'OC90' }), 1)

    renderView()

    expect(await screen.findByText('3 артикула')).toBeInTheDocument()
  })

  it('prices the lines from a live read rather than from the stored cart', async () => {
    const item = article()
    useCart.getState().addLine(item, 2)
    getAvailability.mockResolvedValue(availabilityFor(item))

    renderView()

    // Once on the line, once as the cart total.
    expect(await screen.findAllByText('24,00 €')).toHaveLength(2)
    expect(screen.getByText('12,00 €')).toBeInTheDocument()
    expect(getAvailability).toHaveBeenCalledWith([
      expect.objectContaining({ brandId: '268', articleNumber: 'WL6340' }),
    ])
  })

  it('writes a quantity change back to the cart', async () => {
    const user = userEvent.setup()
    const item = article()
    useCart.getState().addLine(item, 1)
    getAvailability.mockResolvedValue(availabilityFor(item))

    renderView()

    await user.click(
      await screen.findByRole('button', {
        name: 'Увеличи количеството за WL6340',
      }),
    )

    await waitFor(() => {
      expect(useCart.getState().lines[0].quantity).toBe(2)
    })
  })

  it('removes a line from the cart', async () => {
    const user = userEvent.setup()
    useCart.getState().addLine(article(), 1)

    renderView()

    await user.click(
      await screen.findByRole('button', {
        name: 'Премахни WL6340 от кошницата',
      }),
    )

    await waitFor(() => {
      expect(useCart.getState().lines).toHaveLength(0)
    })
  })

  it('empties the cart once the ask is confirmed', async () => {
    const user = userEvent.setup()
    useCart.getState().addLine(article(), 1)

    renderView()

    await user.click(await screen.findByText('Изпразни кошницата'))
    await user.click(await screen.findByRole('button', { name: 'Изпразни' }))

    expect(await screen.findByText('Кошницата е празна')).toBeInTheDocument()
  })

  // The query key carries every article in the cart, so removing one asks a
  // different question — and the lines that stayed must not lose the prices
  // already on screen while the new answer lands.
  it('keeps the remaining prices on screen while a removal refetches', async () => {
    const user = userEvent.setup()
    const filter = article()
    const pads = article({ articleNumber: 'BP1234', description: 'Накладки' })
    useCart.getState().addLine(filter, 1)
    useCart.getState().addLine(pads, 1)
    getAvailability.mockResolvedValue({
      ...availabilityFor(filter),
      ...availabilityFor(pads),
    })

    renderView()

    await screen.findAllByText('12,00 €')

    // Never resolves, so the render stays in the state a removal leaves behind.
    getAvailability.mockImplementation(() => new Promise(() => {}))

    await user.click(
      screen.getByRole('button', { name: 'Премахни BP1234 от кошницата' }),
    )

    expect(screen.getAllByText('12,00 €').length).toBeGreaterThan(0)
    expect(
      screen.queryByTestId('cart-row-price-skeleton'),
    ).not.toBeInTheDocument()
  })

  it('leaves a deselected line out of the summary but keeps it on screen', async () => {
    const user = userEvent.setup()
    const item = article()
    useCart.getState().addLine(item, 2)
    getAvailability.mockResolvedValue(availabilityFor(item))

    renderView()

    // Both the line total and the cart total, before anything is deselected.
    expect(await screen.findAllByText('24,00 €')).toHaveLength(2)

    await user.click(screen.getByRole('checkbox', { name: 'Избери WL6340' }))

    // The line keeps its own total; the summary's three figures drop to zero.
    expect(await screen.findAllByText('0,00 €')).toHaveLength(3)
    expect(screen.getAllByText('24,00 €')).toHaveLength(1)
    expect(screen.getByText('Маслен филтър')).toBeInTheDocument()
  })

  it('clears and restores every line from the select-all', async () => {
    const user = userEvent.setup()
    useCart.getState().addLine(article(), 1)
    useCart.getState().addLine(article({ articleNumber: 'OC90' }), 1)

    renderView()

    const selectAll = await screen.findByRole('checkbox', {
      name: 'Избери всички артикули',
    })

    await user.click(selectAll)
    await waitFor(() => {
      expect(useCart.getState().lines.every((line) => !line.isSelected)).toBe(true)
    })

    await user.click(selectAll)
    await waitFor(() => {
      expect(useCart.getState().lines.every((line) => line.isSelected)).toBe(true)
    })
  })

  // A transient inventory outage must not read as a verdict on the parts.
  it('offers a scoped retry when the availability read fails', async () => {
    useCart.getState().addLine(article(), 1)
    getAvailability.mockRejectedValue(new Error('503'))

    renderView()

    expect(
      await screen.findByText(
        'В момента не можем да заредим цените и наличностите на кошницата.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Маслен филтър')).toBeInTheDocument()
  })

  // The add is disabled out on the catalog, which is no help to someone already
  // here wondering why — so the cart says what the limit is.
  it('says the cart is full once it holds as many lines as it may', async () => {
    useCart.setState({
      lines: Array.from({ length: MAX_CART_LINES }, (_, index) => ({
        ...article({ articleNumber: `A${index}` }),
        quantity: 1,
        isSelected: true,
        addedAtPriceIncVat: null,
      })),
    })

    renderView()

    expect(
      await screen.findByText(
        `Кошницата е пълна — до ${MAX_CART_LINES} различни артикула. Премахнете артикул, за да добавите друг.`,
      ),
    ).toBeInTheDocument()
  })

  it('says nothing about the limit while there is room', async () => {
    useCart.getState().addLine(article(), 1)

    renderView()

    await screen.findByText('Маслен филтър')
    expect(screen.queryByText(/Кошницата е пълна/)).not.toBeInTheDocument()
  })

  // A cut-off is the instant the shown delivery promise stops being true, and
  // nothing in the snapshot lets the browser work out the new one — so the cart
  // asks again rather than leaving a stale band on screen.
  describe('when an order cut-off passes', () => {
    /** The same read, carrying a warehouse whose cut-off is `offsetMs` away. */
    function availabilityWithCutoff(
      item: CartLineArticle,
      offsetMs: number,
    ): ArticlesAvailabilityDto {
      return {
        [articleIdentityKey(item.brandId, item.articleNumber)]: {
          available: true,
          bestPriceExVat: 1000,
          bestPriceIncVat: 1200,
          availabilityByWarehouse: [
            {
              warehouseId: 'CENTRAL',
              quantity: 4,
              deliveryWorkDays: 0,
              orderCutoffTime: '17:00',
              cutoffAt: new Date(Date.now() + offsetMs).toISOString(),
              pickup: {
                earliestAt: new Date(Date.now() + offsetMs).toISOString(),
                granularity: 'DAY',
              },
              courier: {
                earliestAt: new Date(Date.now() + offsetMs).toISOString(),
                granularity: 'DAY',
              },
            },
          ],
          computedAt: new Date().toISOString(),
        },
      }
    }

    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('re-reads the availability', async () => {
      const item = article()
      useCart.getState().addLine(item, 1)
      getAvailability.mockResolvedValue(availabilityWithCutoff(item, 30_000))

      renderView()
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0)
      })
      // The first read is on screen, so the cut-offs it carried are scheduled.
      expect(screen.getAllByText('12,00 €').length).toBeGreaterThan(0)
      expect(getAvailability).toHaveBeenCalledTimes(1)

      await act(async () => {
        await jest.advanceTimersByTimeAsync(31_000)
      })

      expect(getAvailability).toHaveBeenCalledTimes(2)
    })

    it('waits for the cut-off rather than polling', async () => {
      const item = article()
      useCart.getState().addLine(item, 1)
      getAvailability.mockResolvedValue(availabilityWithCutoff(item, 30_000))

      renderView()
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0)
      })

      await act(async () => {
        await jest.advanceTimersByTimeAsync(29_000)
      })

      expect(getAvailability).toHaveBeenCalledTimes(1)
    })
  })
})
