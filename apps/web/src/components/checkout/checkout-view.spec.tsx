import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import {
  AppErrorCode,
  articleIdentityKey,
  CustomerRole,
  EMPTY_CART,
  DeliveryDestinationType,
  DeliveryMethod,
  PaymentMethod,
  ShippingMethod,
  type ArticleIdentityDto,
  type ArticlesAvailabilityDto,
  type ParcelEstimateDto,
} from '@vp-parts-shop/shared'
import { useCart, type CartLine } from '@/hooks/use-cart'
import { ApiError } from '@/lib/api'
import { cartQueryOptions } from '@/lib/api/cart'
import { customerProfileQueryOptions } from '@/lib/api/customers'
import { placeOrder } from '@/lib/api/orders'
import { useCheckoutDelivery } from '@/hooks/use-checkout-delivery'
import { useCheckoutPayment } from '@/hooks/use-checkout-payment'
import { CheckoutView } from './checkout-view'

const getAvailability = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  AVAILABILITY_QUERY_KEY: jest.requireActual('@/lib/api/catalog/availability')
    .AVAILABILITY_QUERY_KEY,
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
const getTotals = jest.fn()

jest.mock('@/lib/api/checkout', () => ({
  CHECKOUT_QUERY_KEY: jest.requireActual('@/lib/api/checkout').CHECKOUT_QUERY_KEY,
  DELIVERY_QUOTE_QUERY_KEY: jest.requireActual('@/lib/api/checkout').DELIVERY_QUOTE_QUERY_KEY,
  checkoutTotalsQueryOptions: (cartId: string, cartVersion: number) => ({
    queryKey: ['checkout', 'totals', cartId, cartVersion],
    queryFn: () => getTotals() as Promise<unknown>,
    enabled: cartId !== '',
  }),
  parcelEstimateQueryOptions: (carrier: string, cartId: string, cartVersion: number) => ({
    queryKey: ['checkout', 'parcel', carrier, cartId, cartVersion],
    queryFn: () => getParcel() as Promise<ParcelEstimateDto>,
    enabled: cartId !== '',
  }),
  deliveryQuoteQueryOptions: (
    request: { carrier: string; destination: unknown; isCashOnDelivery: boolean } | null,
    cartId: string,
    cartVersion: number,
  ) => ({
    queryKey: [
      'checkout',
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

jest.mock('@/lib/api/orders', () => ({ placeOrder: jest.fn() }))

jest.mock('@/lib/api/customers', () => ({
  customerProfileQueryOptions: {
    queryKey: ['customers', 'me'],
    queryFn: () => new Promise(() => {}),
  },
}))

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

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

const PROFILE = {
  id: 'customer-1',
  email: 'ivan@example.bg',
  firstName: 'Иван',
  lastName: 'Петров',
  phoneNumber: '+359888123456',
  role: CustomerRole.CUSTOMER,
  createdAt: '2026-10-01T10:00:00.000Z',
}

const replace = jest.fn()

function renderView({ profile }: { profile?: typeof PROFILE } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  // Stands in for the read `CartSync` makes at the root, so an empty mirror is believed.
  queryClient.setQueryData(cartQueryOptions.queryKey, EMPTY_CART)
  if (profile) {
    queryClient.setQueryData(customerProfileQueryOptions.queryKey, profile)
  }

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
    getTotals.mockReset().mockResolvedValue({
      cartVersion: 2,
      goodsTotal: 1200,
      netAmount: 1000,
      vatAmount: 200,
      total: 1200,
    })
    replace.mockReset()
    jest.mocked(useRouter).mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>)
    jest.mocked(placeOrder).mockReset()
    getParcel.mockReset().mockResolvedValue({
      weightGrams: 2300,
      isLockerEligible: true,
    })
    getQuote.mockReset().mockImplementation((request: { isCashOnDelivery: boolean }) => {
      const fee = request.isCashOnDelivery ? 152 : 0
      const total = 1200 + 714 + fee
      const netAmount = Math.round(total / 1.2)

      return Promise.resolve({
        cartVersion: 2,
        priceIncVatCents: 714,
        cashOnDeliveryFeeIncVatCents: request.isCashOnDelivery ? fee : null,
        expectedDeliveryDate: '2026-09-30',
        money: {
          goodsTotal: 1200,
          deliveryPrice: 714,
          cashOnDeliveryFee: fee,
          total,
          netAmount,
          vatAmount: total - netAmount,
        },
      })
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

  it('preselects no contact mode, and offers no quick order yet', async () => {
    useCart.setState({ lines: [line()] })

    renderView()

    expect(await screen.findByRole('radio', { name: /Вход/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Регистрация/ })).not.toBeChecked()
    expect(screen.queryByRole('radio', { name: /Бърза поръчка/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Заяви поръчка' })).not.toBeInTheDocument()
  })

  it('preselects no payment method and remembers the one picked', async () => {
    const user = userEvent.setup()
    useCart.setState({ lines: [line()] })

    renderView()

    const cashOnDelivery = await screen.findByRole('radio', { name: /Наложен платеж/ })
    expect(cashOnDelivery).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Плащане с карта/ })).toBeDisabled()

    await user.click(cashOnDelivery)

    expect(cashOnDelivery).toBeChecked()
    expect(useCheckoutPayment.getState().method).toBe(PaymentMethod.CASH_ON_DELIVERY)
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
    expect(
      screen.getByRole('button', { name: 'Купи сега' }),
    ).toBeInTheDocument()
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
    expect(await within(summary).findByText('19,14 €')).toBeInTheDocument()
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

  describe('placing the order', () => {
    const ORDERED_TO_OFFICE = {
      cartId: 'cart-1',
      cartVersion: 2,
      expectedTotalCents: 2066,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      delivery: {
        method: DeliveryMethod.COURIER_OFFICE,
        carrier: ShippingMethod.ECONT,
        officeCode: '1127',
      },
    }

    function readyToOrder() {
      jest.mocked(useAuth).mockReturnValue({
        isLoaded: true,
        isSignedIn: true,
      } as ReturnType<typeof useAuth>)
      const item = line()
      useCart.setState({ lines: [item], cartId: 'cart-1', version: 2 })
      useCheckoutDelivery.setState({
        method: 'courier-office',
        office: { carrier: ShippingMethod.ECONT, code: '1127' },
      })
      useCheckoutPayment.setState({ method: PaymentMethod.CASH_ON_DELIVERY })
      getAvailability.mockResolvedValue(availabilityFor(item))
    }

    async function orderButton() {
      const button = screen.getByRole('button', { name: 'Купи сега' })
      await waitFor(() => expect(button).toBeEnabled())

      return button
    }

    it('places it at the quoted total, to the chosen office, paid on delivery', async () => {
      const user = userEvent.setup()
      readyToOrder()
      jest.mocked(placeOrder).mockResolvedValue({ orderId: 'order-1', orderReference: 'VP-000123' })

      renderView({ profile: PROFILE })
      await user.click(await orderButton())

      expect(jest.mocked(placeOrder).mock.calls[0][0]).toEqual(ORDERED_TO_OFFICE)
      expect(await screen.findByRole('status')).toHaveTextContent('Потвърждаваме я…')
      expect(replace).toHaveBeenCalledWith('/orders/order-1')
      expect(useCheckoutDelivery.getState().method).toBeNull()
    })

    it('places a store pickup at the goods total', async () => {
      const user = userEvent.setup()
      readyToOrder()
      useCheckoutDelivery.setState({ method: 'store-pickup' })
      jest.mocked(placeOrder).mockResolvedValue({ orderId: 'order-1', orderReference: 'VP-000123' })

      renderView({ profile: PROFILE })
      await user.click(await orderButton())

      expect(jest.mocked(placeOrder).mock.calls[0][0]).toMatchObject({
        expectedTotalCents: 1200,
        delivery: { method: DeliveryMethod.STORE_PICKUP },
      })
    })

    it('cannot be placed until the profile has a phone', async () => {
      readyToOrder()

      renderView({ profile: { ...PROFILE, phoneNumber: null as unknown as string } })

      const summary = (await screen.findByText('Обобщение на поръчката')).closest('section')!
      expect(await within(summary).findByText('20,66 €')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Купи сега' }),
      ).toBeDisabled()
    })

    it('cannot be placed while a selected line is out of stock', async () => {
      readyToOrder()
      getAvailability.mockResolvedValue(availabilityFor(line(), false))

      renderView({ profile: PROFILE })

      expect(await screen.findByText(/не могат да бъдат поръчани/)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Купи сега' }),
      ).toBeDisabled()
    })

    it('says the price changed and re-quotes when the server refuses the total', async () => {
      const user = userEvent.setup()
      readyToOrder()
      jest
        .mocked(placeOrder)
        .mockRejectedValue(new ApiError(409, AppErrorCode.PRICE_CHANGED))

      renderView({ profile: PROFILE })
      await user.click(await orderButton())

      expect(await screen.findByRole('alert')).toHaveTextContent(/Цената на поръчката е променена/)
      await waitFor(() => expect(getQuote).toHaveBeenCalledTimes(2))
      expect(replace).not.toHaveBeenCalled()
    })
  })
})
