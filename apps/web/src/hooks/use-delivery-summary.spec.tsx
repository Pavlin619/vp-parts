import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import {
  DeliveryDestinationType,
  ShippingMethod,
  type DeliveryQuoteDto,
  type DeliveryQuoteRequestDto,
  type ParcelEstimateDto,
} from '@vp-parts-shop/shared'
import { ApiError } from '@/lib/api'
import { useCart } from './use-cart'
import { useCheckoutDelivery } from './use-checkout-delivery'
import { useDeliverySummary } from './use-delivery-summary'

const getParcel = jest.fn<Promise<ParcelEstimateDto>, []>()
const getQuote = jest.fn<Promise<DeliveryQuoteDto>, [DeliveryQuoteRequestDto]>()

jest.mock('@/lib/api/checkout', () => ({
  parcelEstimateQueryOptions: (carrier: string, cartId: string, cartVersion: number) => ({
    queryKey: ['checkout', 'parcel', carrier, cartId, cartVersion],
    queryFn: () => getParcel(),
  }),
  deliveryQuoteQueryOptions: (
    request: DeliveryQuoteRequestDto | null,
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
    queryFn: () => getQuote(request as DeliveryQuoteRequestDto),
    retry: false,
  }),
}))

jest.mock('@/lib/api/cart')

const PARCEL: ParcelEstimateDto = {
  weightGrams: 2300,
  isLockerEligible: true,
}

const QUOTE: DeliveryQuoteDto = {
  carrier: ShippingMethod.ECONT,
  destination: { type: DeliveryDestinationType.OFFICE, officeCode: '1127' },
  priceIncVatCents: 714,
  cashOnDeliveryFeeIncVatCents: null,
  expectedDeliveryDate: '2026-09-30',
  parcel: PARCEL,
  cartVersion: 4,
  money: null,
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function chooseOffice(code: string | null) {
  useCheckoutDelivery.setState({
    method: 'courier-office',
    office: code ? { carrier: ShippingMethod.ECONT, code } : null,
  })
}

describe('useDeliverySummary', () => {
  beforeEach(() => {
    useCart.setState({ cartId: 'cart-1', version: 4 })
    chooseOffice('1127')
    getParcel.mockReset().mockResolvedValue(PARCEL)
    getQuote.mockReset().mockResolvedValue(QUOTE)
  })

  it('weighs the parcel and quotes it to the chosen office', async () => {
    const { result } = renderHook(() => useDeliverySummary(null, false), { wrapper })

    await waitFor(() => expect(result.current.delivery.kind).toBe('quoted'))

    expect(result.current.parcelCheck).toEqual({ state: 'ready', parcel: PARCEL })
    expect(result.current.delivery).toEqual({
      kind: 'quoted',
      priceIncVatCents: 714,
      cashOnDeliveryFeeIncVatCents: null,
      expectedDeliveryDate: '2026-09-30',
      money: null,
    })
    expect(getQuote).toHaveBeenCalledWith({
      carrier: ShippingMethod.ECONT,
      destination: { type: DeliveryDestinationType.OFFICE, officeCode: '1127' },
      isCashOnDelivery: false,
    })
  })

  it('quotes the fee for collecting the money when the customer pays on delivery', async () => {
    getQuote.mockResolvedValue({ ...QUOTE, cashOnDeliveryFeeIncVatCents: 152 })

    const { result } = renderHook(() => useDeliverySummary(null, true), { wrapper })

    await waitFor(() => expect(result.current.delivery.kind).toBe('quoted'))

    expect(getQuote).toHaveBeenCalledWith(expect.objectContaining({ isCashOnDelivery: true }))
    expect(result.current.delivery).toMatchObject({ cashOnDeliveryFeeIncVatCents: 152 })
  })

  it('does not ask for a quote before a method is chosen', async () => {
    useCheckoutDelivery.setState({ method: null })

    const { result } = renderHook(() => useDeliverySummary(null, false), { wrapper })

    await waitFor(() => expect(result.current.parcelCheck.state).toBe('ready'))

    expect(result.current.delivery).toEqual({ kind: 'awaiting-method' })
    expect(getQuote).not.toHaveBeenCalled()
  })

  it('does not ask for a quote before an office is chosen', async () => {
    chooseOffice(null)

    const { result } = renderHook(() => useDeliverySummary(null, false), { wrapper })

    await waitFor(() => expect(result.current.parcelCheck.state).toBe('ready'))

    expect(result.current.delivery).toEqual({ kind: 'awaiting-office' })
    expect(getQuote).not.toHaveBeenCalled()
  })

  it('does not ask for a quote before an address is accepted', async () => {
    useCheckoutDelivery.setState({ method: 'courier-address', address: null })

    const { result } = renderHook(() => useDeliverySummary(null, false), { wrapper })

    await waitFor(() => expect(result.current.parcelCheck.state).toBe('ready'))

    expect(result.current.delivery).toEqual({ kind: 'awaiting-address' })
    expect(getQuote).not.toHaveBeenCalled()
  })

  it('quotes delivery to the accepted address', async () => {
    const address = { placeId: '41', street: 'бул. Витоша', streetNumber: '1' }
    useCheckoutDelivery.setState({
      method: 'courier-address',
      address: { carrier: ShippingMethod.ECONT, address, label: 'бул. Витоша 1' },
    })

    const { result } = renderHook(() => useDeliverySummary(null, false), { wrapper })

    await waitFor(() => expect(result.current.delivery.kind).toBe('quoted'))

    expect(getQuote).toHaveBeenCalledWith({
      carrier: ShippingMethod.ECONT,
      destination: { type: DeliveryDestinationType.ADDRESS, address },
      isCashOnDelivery: false,
    })
  })

  it('asks for another office when the carrier refuses the chosen one', async () => {
    getQuote.mockRejectedValue(new ApiError(422, 'DELIVERY_OFFICE_REFUSED'))

    const { result } = renderHook(() => useDeliverySummary(null, false), { wrapper })

    await waitFor(() => expect(result.current.delivery).toEqual({ kind: 'office-unusable' }))
  })

  it('fails when the parcel cannot be weighed, without quoting', async () => {
    getParcel.mockRejectedValue(new ApiError(503, 'DELIVERY_UNAVAILABLE'))

    const { result } = renderHook(() => useDeliverySummary(null, false), { wrapper })

    await waitFor(() => expect(result.current.delivery).toEqual({ kind: 'failed' }))

    expect(getQuote).not.toHaveBeenCalled()
  })

  it('frees a store pickup without asking the carrier for a quote', async () => {
    useCheckoutDelivery.setState({ method: 'store-pickup' })

    const { result } = renderHook(() => useDeliverySummary('2026-07-02T06:00:00.000Z', false), {
      wrapper,
    })

    await waitFor(() => expect(result.current.parcelCheck.state).toBe('ready'))

    expect(result.current.delivery).toEqual({
      kind: 'pickup',
      readyAt: '2026-07-02T06:00:00.000Z',
    })
    expect(getQuote).not.toHaveBeenCalled()
  })
})
