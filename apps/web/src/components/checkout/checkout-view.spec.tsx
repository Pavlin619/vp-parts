import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  articleIdentityKey,
  DeliveryDestinationType,
  ShippingMethod,
  type ArticleIdentityDto,
  type ArticlesAvailabilityDto,
  type ParcelEstimateDto,
} from '@vp-parts-shop/shared'
import { useCart, type CartLine } from '@/hooks/use-cart'
import { useCheckoutDelivery } from '@/hooks/use-checkout-delivery'
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

const getParcel = jest.fn()
const getQuote = jest.fn()

jest.mock('@/lib/api/delivery', () => ({
  parcelEstimateQueryOptions: (carrier: string, cartId: string, cartVersion: number) => ({
    queryKey: ['delivery', 'parcel', carrier, cartId, cartVersion],
    queryFn: () => getParcel() as Promise<ParcelEstimateDto>,
    enabled: cartId !== '',
  }),
  deliveryQuoteQueryOptions: (
    request: { carrier: string; destination: unknown },
    cartId: string,
    cartVersion: number,
  ) => ({
    queryKey: ['delivery', 'quote', request.carrier, request.destination, cartId, cartVersion],
    queryFn: () => getQuote(request) as Promise<unknown>,
  }),
}))

jest.mock('@/lib/api/cart')

jest.mock('./delivery/offices', () => ({
  OfficePicker: () => <div data-testid="office-picker" />,
}))

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
    useCheckoutDelivery.setState({ method: 'courier-address', office: null })
    getAvailability.mockReset()
    getAvailability.mockResolvedValue({})
    getParcel.mockReset().mockResolvedValue({
      weightGrams: 2300,
      isLockerEligible: true,
    })
    getQuote.mockReset().mockResolvedValue({
      priceIncVatCents: 714,
      expectedDeliveryDate: '2026-09-30',
    })
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
    expect(screen.getByTestId('office-picker')).toBeInTheDocument()
  })

  // A reload, or a return visit, finds the customer's choice where they left it.
  it('remembers the chosen delivery method', async () => {
    const user = userEvent.setup()
    useCart.setState({ lines: [line()] })

    renderView()
    await user.click(await screen.findByRole('radio', { name: /до офис/ }))

    expect(useCheckoutDelivery.getState().method).toBe('courier-office')
  })

  it('opens on the method chosen before', async () => {
    useCart.setState({ lines: [line()] })
    useCheckoutDelivery.setState({ method: 'courier-office' })

    renderView()

    expect(await screen.findByRole('radio', { name: /до офис/ })).toBeChecked()
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

  it('weighs the parcel and prices delivery to the remembered office in the summary', async () => {
    const item = line()
    useCart.setState({ lines: [item], cartId: 'cart-1', version: 2 })
    useCheckoutDelivery.setState({
      method: 'courier-office',
      office: { carrier: ShippingMethod.ECONT, code: '1127' },
    })
    getAvailability.mockResolvedValue(availabilityFor(item))

    renderView()

    const summary = (await screen.findByText('Обобщение на поръчката')).closest('section')!
    expect(await within(summary).findByText('2,3 кг')).toBeInTheDocument()
    expect(await within(summary).findByText('7,14 €')).toBeInTheDocument()
    expect(within(summary).getByText('19,14 €')).toBeInTheDocument()
    expect(getQuote).toHaveBeenCalledWith({
      carrier: ShippingMethod.ECONT,
      destination: { type: DeliveryDestinationType.OFFICE, officeCode: '1127' },
    })
  })
})
