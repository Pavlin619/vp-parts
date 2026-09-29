import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import {
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

jest.mock('@/lib/api/delivery', () => ({
  parcelEstimateQueryOptions: (carrier: string, cartId: string, cartVersion: number) => ({
    queryKey: ['delivery', 'parcel', carrier, cartId, cartVersion],
    queryFn: () => getParcel(),
  }),
  deliveryQuoteQueryOptions: (
    request: DeliveryQuoteRequestDto,
    cartId: string,
    cartVersion: number,
  ) => ({
    queryKey: ['delivery', 'quote', request.carrier, request.officeCode, cartId, cartVersion],
    queryFn: () => getQuote(request),
    retry: false,
  }),
}))

jest.mock('@/lib/api/cart')

const PARCEL: ParcelEstimateDto = {
  weightGrams: 2300,
  unmeasuredArticles: [],
  isLockerEligible: true,
}

const QUOTE: DeliveryQuoteDto = {
  carrier: ShippingMethod.ECONT,
  officeCode: '1127',
  priceIncVatCents: 714,
  expectedDeliveryDate: '2026-09-30',
  parcel: PARCEL,
  cartVersion: 4,
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
    const { result } = renderHook(() => useDeliverySummary(), { wrapper })

    await waitFor(() => expect(result.current.delivery.kind).toBe('quoted'))

    expect(result.current.parcelCheck).toEqual({ state: 'ready', parcel: PARCEL })
    expect(result.current.delivery).toEqual({
      kind: 'quoted',
      priceIncVatCents: 714,
      expectedDeliveryDate: '2026-09-30',
    })
    expect(getQuote).toHaveBeenCalledWith({ carrier: ShippingMethod.ECONT, officeCode: '1127' })
  })

  it('does not ask for a quote before an office is chosen', async () => {
    chooseOffice(null)

    const { result } = renderHook(() => useDeliverySummary(), { wrapper })

    await waitFor(() => expect(result.current.parcelCheck.state).toBe('ready'))

    expect(result.current.delivery).toEqual({ kind: 'awaiting-office' })
    expect(getQuote).not.toHaveBeenCalled()
  })

  it('does not ask for a quote for delivery to an address', async () => {
    useCheckoutDelivery.setState({ method: 'courier-address' })

    const { result } = renderHook(() => useDeliverySummary(), { wrapper })

    await waitFor(() => expect(result.current.parcelCheck.state).toBe('ready'))

    expect(result.current.delivery).toEqual({ kind: 'not-quoted' })
    expect(getQuote).not.toHaveBeenCalled()
  })

  // Weightless parts are priced by phone; the API would refuse the quote anyway.
  it('does not ask for a quote when a part has no weight', async () => {
    getParcel.mockResolvedValue({ ...PARCEL, weightGrams: null })

    const { result } = renderHook(() => useDeliverySummary(), { wrapper })

    await waitFor(() => expect(result.current.delivery).toEqual({ kind: 'by-phone' }))

    expect(getQuote).not.toHaveBeenCalled()
  })

  it('asks for another office when the carrier refuses the chosen one', async () => {
    getQuote.mockRejectedValue(new ApiError(422, 'DELIVERY_OFFICE_REFUSED'))

    const { result } = renderHook(() => useDeliverySummary(), { wrapper })

    await waitFor(() => expect(result.current.delivery).toEqual({ kind: 'office-unusable' }))
  })

  it('fails when the parcel cannot be weighed, without quoting', async () => {
    getParcel.mockRejectedValue(new ApiError(503, 'DELIVERY_UNAVAILABLE'))

    const { result } = renderHook(() => useDeliverySummary(), { wrapper })

    await waitFor(() => expect(result.current.delivery).toEqual({ kind: 'failed' }))

    expect(getQuote).not.toHaveBeenCalled()
  })
})
