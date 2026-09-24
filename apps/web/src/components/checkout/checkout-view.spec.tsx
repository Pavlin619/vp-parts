import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  articleIdentityKey,
  type ArticleIdentityDto,
  type ArticlesAvailabilityDto,
} from '@vp-parts-shop/shared'
import { useCart, type CartLine } from '@/hooks/use-cart'
import { CheckoutView } from './checkout-view'

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

jest.mock('@/lib/api/cart')

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    brandId: '268',
    articleNumber: 'WL6340',
    brandName: 'WIX',
    brandLogoUrl: null,
    description: 'Маслен филтър',
    thumbnailUrl: null,
    quantity: 1,
    isSelected: true,
    addedAtPriceIncVat: null,
    ...overrides,
  }
}

function availabilityFor(
  item: CartLine,
  available = true,
): ArticlesAvailabilityDto {
  return {
    [articleIdentityKey(item.brandId, item.articleNumber)]: {
      available,
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
      <CheckoutView />
    </QueryClientProvider>,
  )
}

describe('CheckoutView', () => {
  beforeEach(() => {
    useCart.setState({ lines: [], lastWriteError: null })
    getAvailability.mockReset()
    getAvailability.mockResolvedValue({})
  })

  it('sends an empty cart back to the catalogue', async () => {
    renderView()

    expect(await screen.findByText('Кошницата е празна')).toBeInTheDocument()
  })

  it('sends a cart with nothing selected back to the cart', async () => {
    useCart.setState({ lines: [line({ isSelected: false })] })

    renderView()

    expect(await screen.findByText('Няма избрани артикули')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Към кошницата' })).toHaveAttribute(
      'href',
      '/cart',
    )
  })

  it('marks delivery and payment as the current step', async () => {
    useCart.setState({ lines: [line()] })

    renderView()

    expect(
      await screen.findByText('Доставка и плащане', { selector: 'h1' }),
    ).toBeInTheDocument()
    const steps = screen.getByRole('navigation', { name: 'Стъпки на поръчката' })
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent(
      'Доставка и плащане',
    )
  })

  it('lists only the selected lines, priced from the live read', async () => {
    const filter = line({ quantity: 2 })
    const pads = line({ articleNumber: 'BP1234', isSelected: false })
    useCart.setState({ lines: [filter, pads] })
    getAvailability.mockResolvedValue({
      ...availabilityFor(filter),
      ...availabilityFor(pads),
    })

    renderView()

    const items = await screen.findByRole('list', { name: 'Артикули в поръчката' })
    expect(await within(items).findByText('24,00 €')).toBeInTheDocument()
    expect(within(items).getByText('WL6340')).toBeInTheDocument()
    expect(within(items).queryByText('BP1234')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Артикули · 2' })).toBeInTheDocument()
  })

  it('starts on delivery to an address and lets the customer switch', async () => {
    const user = userEvent.setup()
    useCart.setState({ lines: [line()] })

    renderView()

    const address = await screen.findByRole('radio', { name: /до адрес/ })
    const office = screen.getByRole('radio', { name: /до офис/ })
    expect(address).toBeChecked()

    await user.click(office)

    expect(office).toBeChecked()
    expect(address).not.toBeChecked()
  })

  it('sends the customer back to the cart when a line can no longer be ordered', async () => {
    const item = line()
    useCart.setState({ lines: [item] })
    getAvailability.mockResolvedValue(availabilityFor(item, false))

    renderView()

    expect(
      await screen.findByText(/не могат да бъдат поръчани/),
    ).toBeInTheDocument()
  })
})
