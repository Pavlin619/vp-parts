import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  articleIdentityKey,
  type ArticleIdentityDto,
  type ArticlesAvailabilityDto,
} from '@vp-parts-shop/shared'
import { useCartDrawer } from '@/hooks/use-cart-drawer'
import { useCart, type CartLineArticle } from '@/hooks/use-cart'
import { CartDrawer } from './cart-drawer'

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

function priced(
  item: CartLineArticle,
  incVat: number,
  exVat: number,
): ArticlesAvailabilityDto {
  return {
    [articleIdentityKey(item.brandId, item.articleNumber)]: {
      available: true,
      bestPriceExVat: exVat,
      bestPriceIncVat: incVat,
      availabilityByWarehouse: [],
      computedAt: null,
    },
  }
}

function renderDrawer() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <CartDrawer />
    </QueryClientProvider>,
  )
}

describe('CartDrawer', () => {
  beforeEach(() => {
    useCart.setState({ lines: [] })
    useCartDrawer.setState({ isOpen: false })
    getAvailability.mockReset()
    getAvailability.mockResolvedValue({})
  })

  it('renders nothing while closed', () => {
    useCart.getState().addLine(article(), 1)

    renderDrawer()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // Closed, it must not spend a request on prices nobody is looking at.
  it('reads no prices while closed', () => {
    useCart.getState().addLine(article(), 1)

    renderDrawer()

    expect(getAvailability).not.toHaveBeenCalled()
  })

  it('lists what the cart holds once opened', async () => {
    useCart.getState().addLine(article(), 2)
    useCartDrawer.setState({ isOpen: true })
    getAvailability.mockResolvedValue(priced(article(), 1200, 1000))

    renderDrawer()

    expect(await screen.findByTestId('cart-drawer-total')).toHaveTextContent(
      '24,00 €',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('2 артикула')).toBeInTheDocument()
    expect(screen.getByText('Маслен филтър')).toBeInTheDocument()
  })

  it('totals the selected lines', async () => {
    useCart.getState().addLine(article(), 1)
    useCart.getState().addLine(article({ articleNumber: 'OC90' }), 1)
    getAvailability.mockResolvedValue({
      ...priced(article(), 1200, 1000),
      ...priced(article({ articleNumber: 'OC90' }), 2400, 2000),
    })
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    expect(await screen.findByTestId('cart-drawer-total')).toHaveTextContent(
      '36,00 €',
    )
  })

  it('leaves a deselected line out of the total', async () => {
    useCart.getState().addLine(article(), 1)
    useCart.getState().addLine(article({ articleNumber: 'OC90' }), 1)
    useCart.getState().toggleLineSelected({ brandId: '268', articleNumber: 'OC90' })
    getAvailability.mockResolvedValue({
      ...priced(article(), 1200, 1000),
      ...priced(article({ articleNumber: 'OC90' }), 2400, 2000),
    })
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    expect(await screen.findByTestId('cart-drawer-total')).toHaveTextContent(
      '12,00 €',
    )
  })

  // The prices of the products and nothing else — delivery is the checkout's.
  it('quotes no delivery cost or date', async () => {
    useCart.getState().addLine(article(), 1)
    getAvailability.mockResolvedValue(priced(article(), 1200, 1000))
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    await screen.findByTestId('cart-drawer-total')
    expect(screen.queryByText(/[Дд]оставк/)).not.toBeInTheDocument()
  })

  it('offers a way to the catalogue when the cart is empty', () => {
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    expect(screen.getByText('Кошницата е празна')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Към каталога' })).toHaveAttribute(
      'href',
      '/catalog',
    )
    expect(
      screen.queryByRole('link', { name: /Виж кошницата/ }),
    ).not.toBeInTheDocument()
  })

  it('leads to the full cart page', async () => {
    useCart.getState().addLine(article(), 1)
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    const link = await screen.findByRole('link', { name: /Виж кошницата/ })
    expect(link).toHaveAttribute('href', '/cart')
  })

  // Left open, it would cover the very page it just navigated to.
  it('closes on the way to the cart page', async () => {
    const user = userEvent.setup()
    useCart.getState().addLine(article(), 1)
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    await user.click(await screen.findByRole('link', { name: /Виж кошницата/ }))

    expect(useCartDrawer.getState().isOpen).toBe(false)
  })

  // Any link off this panel — not just the two footer actions — leaves it
  // covering a page it no longer belongs on.
  it('closes when the empty state leads to the catalogue', async () => {
    const user = userEvent.setup()
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    await user.click(screen.getByRole('link', { name: 'Към каталога' }))

    expect(useCartDrawer.getState().isOpen).toBe(false)
  })

  it('closes when a line leads to its article page', async () => {
    const user = userEvent.setup()
    useCart.getState().addLine(article(), 1)
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    await user.click(await screen.findByRole('link', { name: 'WL6340' }))

    expect(useCartDrawer.getState().isOpen).toBe(false)
  })

  // Adjusting a line is working the cart, not leaving it — the visitor should
  // still see the drawer's total update.
  it('stays open when a line quantity changes', async () => {
    const user = userEvent.setup()
    useCart.getState().addLine(article(), 1)
    getAvailability.mockResolvedValue(priced(article(), 1200, 1000))
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    await user.click(
      await screen.findByRole('button', {
        name: 'Увеличи количеството за WL6340',
      }),
    )

    expect(useCartDrawer.getState().isOpen).toBe(true)
  })

  it('stays open when a line is removed', async () => {
    const user = userEvent.setup()
    useCart.getState().addLine(article(), 1)
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    await user.click(
      await screen.findByRole('button', {
        name: 'Премахни WL6340 от кошницата',
      }),
    )

    expect(useCartDrawer.getState().isOpen).toBe(true)
  })

  it('closes on the close button', async () => {
    const user = userEvent.setup()
    useCart.getState().addLine(article(), 1)
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    await user.click(screen.getByRole('button', { name: 'Затвори' }))

    expect(useCartDrawer.getState().isOpen).toBe(false)
  })

  it('closes on continue shopping', async () => {
    const user = userEvent.setup()
    useCart.getState().addLine(article(), 1)
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    await user.click(
      await screen.findByRole('button', { name: 'Продължи пазаруването' }),
    )

    expect(useCartDrawer.getState().isOpen).toBe(false)
  })

  it('removes a line from the drawer', async () => {
    const user = userEvent.setup()
    useCart.getState().addLine(article(), 1)
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    await user.click(
      await screen.findByRole('button', {
        name: 'Премахни WL6340 от кошницата',
      }),
    )

    expect(useCart.getState().lines).toHaveLength(0)
  })

  it('raises a line quantity from the drawer', async () => {
    const user = userEvent.setup()
    useCart.getState().addLine(article(), 1)
    getAvailability.mockResolvedValue(priced(article(), 1200, 1000))
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    await user.click(
      await screen.findByRole('button', {
        name: 'Увеличи количеството за WL6340',
      }),
    )

    expect(useCart.getState().lines[0]?.quantity).toBe(2)
  })

  it('warns when the read could not price the cart', async () => {
    useCart.getState().addLine(article(), 1)
    getAvailability.mockRejectedValue(new Error('down'))
    useCartDrawer.setState({ isOpen: true })

    renderDrawer()

    expect(
      await screen.findByText(
        'В момента не можем да заредим цените на кошницата.',
      ),
    ).toBeInTheDocument()
  })
})
