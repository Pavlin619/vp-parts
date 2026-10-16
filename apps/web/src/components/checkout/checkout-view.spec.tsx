import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuth } from '@clerk/nextjs'
import {
  articleIdentityKey,
  EMPTY_CART,
  DeliveryDestinationType,
  PaymentMethod,
  ShippingMethod,
  type ArticleIdentityDto,
  type ArticlesAvailabilityDto,
  type ParcelEstimateDto,
} from '@vp-parts-shop/shared'
import { useCart, type CartLine } from '@/hooks/use-cart'
import { cartQueryOptions } from '@/lib/api/cart'
import { useCheckoutDelivery } from '@/hooks/use-checkout-delivery'
import { useCheckoutPayment } from '@/hooks/use-checkout-payment'
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
    request: { carrier: string; destination: unknown; isCashOnDelivery: boolean } | null,
    cartId: string,
    cartVersion: number,
  ) => ({
    queryKey: [
      'delivery',
      'quote',
      request?.carrier,
      request?.destination,
      request?.isCashOnDelivery,
      cartId,
      cartVersion,
    ],
    queryFn: () => getQuote(request) as Promise<unknown>,
  }),
}))

jest.mock('@/lib/api/cart', () => ({
  ...jest.createMockFromModule<object>('@/lib/api/cart'),
  cartQueryOptions: jest.requireActual('@/lib/api/cart').cartQueryOptions,
}))

jest.mock('@clerk/nextjs', () => ({
  useAuth: jest.fn(),
  useClerk: () => ({ signOut: jest.fn() }),
  SignIn: () => <div data-testid="clerk-sign-in" />,
}))

jest.mock('./contact/signed-in-contact', () => ({
  SignedInContact: () => <div data-testid="signed-in-contact" />,
}))

jest.mock('./delivery/address', () => ({
  AddressPicker: () => <div data-testid="address-picker" />,
}))

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
  // Stands in for the read `CartSync` makes at the root, so an empty mirror is believed.
  queryClient.setQueryData(cartQueryOptions.queryKey, EMPTY_CART)

  return render(
    <QueryClientProvider client={queryClient}>
      <CheckoutView />
    </QueryClientProvider>,
  )
}

describe('CheckoutView', () => {
  beforeEach(() => {
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    } as ReturnType<typeof useAuth>)
    useCart.setState({ lines: [], lastWriteError: null })
    useCheckoutDelivery.getState().reset()
    useCheckoutPayment.getState().reset()
    getAvailability.mockReset()
    getAvailability.mockResolvedValue({})
    getParcel.mockReset().mockResolvedValue({
      weightGrams: 2300,
      isLockerEligible: true,
    })
    getQuote.mockReset().mockImplementation((request: { isCashOnDelivery: boolean }) =>
      Promise.resolve({
        priceIncVatCents: 714,
        cashOnDeliveryFeeIncVatCents: request.isCashOnDelivery ? 152 : null,
        expectedDeliveryDate: '2026-09-30',
      }),
    )
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

  it('preselects no delivery method and lets the customer pick one', async () => {
    const user = userEvent.setup()
    useCart.setState({ lines: [line()] })

    renderView()

    const address = await screen.findByRole('radio', { name: /до адрес/ })
    const office = screen.getByRole('radio', { name: /до офис/ })
    expect(address).not.toBeChecked()
    expect(office).not.toBeChecked()

    await user.click(office)

    expect(office).toBeChecked()
    expect(address).not.toBeChecked()
    expect(screen.getByTestId('office-picker')).toBeInTheDocument()
  })

  it('preselects no contact mode and switches the order button with the one picked', async () => {
    const user = userEvent.setup()
    useCart.setState({ lines: [line()] })

    renderView()

    const quick = await screen.findByRole('radio', { name: /Бърза поръчка/ })
    expect(quick).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Вход/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Регистрация/ })).not.toBeChecked()

    await user.click(quick)

    expect(screen.getByRole('button', { name: 'Заяви поръчка' })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /Вход/ }))

    expect(screen.getByRole('button', { name: /Поръчай сега/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Заяви поръчка' })).not.toBeInTheDocument()
  })

  it('preselects no payment method and remembers the one picked', async () => {
    const user = userEvent.setup()
    useCart.setState({ lines: [line()] })

    renderView()

    const card = await screen.findByRole('radio', { name: /Плащане с карта/ })
    expect(card).not.toBeChecked()

    await user.click(card)

    expect(card).toBeChecked()
    expect(useCheckoutPayment.getState().method).toBe(PaymentMethod.CARD)
    expect(screen.getByRole('button', { name: /Плати с карта/ })).toBeInTheDocument()
  })

  // The quick-order fields already say it is paid on delivery.
  it('asks for no payment method on a quick order', async () => {
    const user = userEvent.setup()
    useCart.setState({ lines: [line()] })

    renderView()
    await user.click(await screen.findByRole('radio', { name: /Бърза поръчка/ }))

    expect(screen.queryByRole('radiogroup', { name: 'Метод на плащане' })).not.toBeInTheDocument()
  })

  // Clerk comes back from Google to `#/sso-callback`, which only the sign-in tab finishes.
  it('opens on the sign-in tab when Clerk returns to it', async () => {
    window.location.hash = '#/sso-callback'
    useCart.setState({ lines: [line()] })

    try {
      renderView()

      expect(await screen.findByRole('radio', { name: /Вход/ })).toBeChecked()
    } finally {
      window.location.hash = ''
    }
  })

  it('places a signed-in order through the account, not as a quick order', async () => {
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    } as ReturnType<typeof useAuth>)
    useCart.setState({ lines: [line()] })

    renderView()

    expect(await screen.findByTestId('signed-in-contact')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Поръчай сега/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Заяви поръчка' })).not.toBeInTheDocument()
  })

  it('does not offer a quick order before the session is known', async () => {
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
    } as unknown as ReturnType<typeof useAuth>)
    useCart.setState({ lines: [line()] })

    renderView()

    expect(await screen.findByRole('button', { name: /Поръчай сега/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Заяви поръчка' })).not.toBeInTheDocument()
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
      isCashOnDelivery: false,
    })
  })

  it('adds the courier fee for collecting the money once cash on delivery is picked', async () => {
    const user = userEvent.setup()
    const item = line()
    useCart.setState({ lines: [item], cartId: 'cart-1', version: 2 })
    useCheckoutDelivery.setState({
      method: 'courier-office',
      office: { carrier: ShippingMethod.ECONT, code: '1127' },
    })
    getAvailability.mockResolvedValue(availabilityFor(item))

    renderView()
    await user.click(await screen.findByRole('radio', { name: /Наложен платеж/ }))

    const summary = (await screen.findByText('Обобщение на поръчката')).closest('section')!
    expect(await within(summary).findByText('1,52 €')).toBeInTheDocument()
    expect(within(summary).getByText('20,66 €')).toBeInTheDocument()
    expect(getQuote).toHaveBeenLastCalledWith(expect.objectContaining({ isCashOnDelivery: true }))
  })
})
