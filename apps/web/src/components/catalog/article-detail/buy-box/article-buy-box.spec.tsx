import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  articleIdentityKey,
  type ArticleIdentityDto,
  type ArticlesAvailabilityDto,
  type WarehouseAvailabilityDto,
  type WarehouseId,
} from '@vp-parts-shop/shared'
import { MAX_CART_LINES, useCart, type CartLineArticle } from '@/hooks/use-cart'
import { useCartDrawer } from '@/hooks/use-cart-drawer'
import { ArticleBuyBox } from './article-buy-box'

// The cart writes through to the server; these cases are about what the component
// puts into the cart, not about the request that follows.
jest.mock('@/lib/api/cart')

// The wrapper fetches availability through this factory; the content component
// is tested separately (article-buy-box-content.spec) with resolved props.
const availabilityMock = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  availabilityQueryOptions: (articles: ArticleIdentityDto[]) => ({
    queryKey: [
      'catalog',
      'availability',
      articles
        .map((article) => `${article.brandId}:${article.articleNumber}`)
        .sort()
        .join(','),
    ],
    queryFn: () => availabilityMock(articles) as Promise<ArticlesAvailabilityDto>,
  }),
}))

const WIX = '268'

const OIL_FILTER: CartLineArticle = {
  brandId: WIX,
  articleNumber: 'WL6340',
  brandName: 'WIX',
  brandLogoUrl: null,
  description: 'Маслен филтър',
  thumbnailUrl: 'https://cdn.example/wl6340.jpg',
}

function warehouse(
  warehouseId: WarehouseId,
  quantity: number,
): WarehouseAvailabilityDto {
  return {
    warehouseId,
    quantity,
    deliveryWorkDays: 0,
    orderCutoffTime: '18:00',
    cutoffAt: '2099-06-25T15:00:00.000Z',
    pickup: { earliestAt: '2020-01-06T08:00:00.000Z', granularity: 'DAY' },
    courier: { earliestAt: '2020-01-07T08:00:00.000Z', granularity: 'DAY' },
  }
}

function renderBuyBox() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ArticleBuyBox article={OIL_FILTER} fitsVehicle={null} />
    </QueryClientProvider>,
  )
}

const inStock = {
  [articleIdentityKey(WIX, 'WL6340')]: {
    available: true,
    bestPriceExVat: 7017,
    bestPriceIncVat: 8420,
    availabilityByWarehouse: [warehouse('CENTRAL', 4)],
    computedAt: '2026-07-05T09:00:00.000Z',
  },
} satisfies ArticlesAvailabilityDto

describe('ArticleBuyBox — live availability', () => {
  beforeEach(() => {
    availabilityMock.mockReset()
    useCart.setState({ lines: [] })
    useCartDrawer.setState({ isOpen: false })
  })

  it('shows the skeleton while the availability read is in flight', () => {
    availabilityMock.mockReturnValue(new Promise(() => {}))
    renderBuyBox()

    expect(screen.getByTestId('article-buy-box-skeleton')).toBeInTheDocument()
  })

  it('renders the buy box from the fetched availability on success', async () => {
    availabilityMock.mockResolvedValue({
      [articleIdentityKey(WIX, 'WL6340')]: {
        available: true,
        bestPriceExVat: 7017,
        bestPriceIncVat: 8420,
        availabilityByWarehouse: [warehouse('CENTRAL', 4)],
        computedAt: '2026-07-05T09:00:00.000Z',
      },
    } satisfies ArticlesAvailabilityDto)

    renderBuyBox()

    expect(
      await screen.findByRole('button', { name: /Добави в кошницата/ }),
    ).toBeInTheDocument()
  })

  it('shows a scoped retry state when the read fails closed', async () => {
    const user = userEvent.setup()
    availabilityMock.mockRejectedValue(new Error('inventory unavailable'))

    renderBuyBox()

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))
    // Retry re-runs the read (initial call + the retry).
    expect(availabilityMock).toHaveBeenCalledTimes(2)
  })
})

describe('ArticleBuyBox — adding to the cart', () => {
  beforeEach(() => {
    availabilityMock.mockReset()
    availabilityMock.mockResolvedValue(inStock)
    useCart.setState({ lines: [] })
    useCartDrawer.setState({ isOpen: false })
  })

  // The cart line renders from what it stores, so the page's own catalog read
  // has to travel into it rather than the cart fetching the part again.
  it('stores the catalog metadata alongside the identity', async () => {
    const user = userEvent.setup()
    renderBuyBox()

    await user.click(
      await screen.findByRole('button', { name: /Добави в кошницата/ }),
    )

    expect(useCart.getState().lines).toEqual([
      // The live price is kept as the line's reference point, so the cart can
      // say it has moved since. It is never rendered as the price.
      { ...OIL_FILTER, quantity: 1, isSelected: true, addedAtPriceIncVat: 8420 },
    ])
  })

  it('adds the selected quantity', async () => {
    const user = userEvent.setup()
    renderBuyBox()

    await user.click(
      await screen.findByRole('button', { name: 'Увеличи количеството' }),
    )
    await user.click(
      screen.getByRole('button', { name: /Добави в кошницата/ }),
    )

    expect(useCart.getState().lines[0]?.quantity).toBe(2)
  })

  it('opens the cart drawer', async () => {
    const user = userEvent.setup()
    renderBuyBox()

    await user.click(
      await screen.findByRole('button', { name: /Добави в кошницата/ }),
    )

    expect(useCartDrawer.getState().isOpen).toBe(true)
  })

  it('stops offering to add once the cart is full of other parts', async () => {
    useCart.setState({
      lines: Array.from({ length: MAX_CART_LINES }, (_, index) => ({
        ...OIL_FILTER,
        articleNumber: `OTHER-${index}`,
        quantity: 1,
        isSelected: true,
        addedAtPriceIncVat: null,
      })),
    })

    renderBuyBox()

    expect(
      await screen.findByRole('button', { name: /Кошницата е пълна/ }),
    ).toBeDisabled()
  })
})
