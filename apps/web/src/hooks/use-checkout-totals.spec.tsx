import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { CartTotalsDto } from '@vp-parts-shop/shared'
import { ApiError } from '@/lib/api'
import { cartFetch } from '@/lib/api/cart/cart-fetch'
import { useCart } from './use-cart'
import { useCheckoutTotals } from './use-checkout-totals'

jest.mock('@/lib/api/cart/cart-fetch')
jest.mock('@/lib/api/cart')

const mockGetTotals = jest.mocked(cartFetch)

const TOTALS: CartTotalsDto = {
  cartVersion: 4,
  goodsTotal: 2400,
  netAmount: 2000,
  vatAmount: 400,
  total: 2400,
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useCheckoutTotals', () => {
  beforeEach(() => {
    useCart.setState({ cartId: 'cart-1', version: 4 })
    mockGetTotals.mockReset().mockResolvedValue(TOTALS)
  })

  it('reads the server’s money for the mirrored cart', async () => {
    const { result } = renderHook(() => useCheckoutTotals(), { wrapper })

    expect(result.current.totals).toBeUndefined()
    await waitFor(() => expect(result.current.totals).toEqual(TOTALS))
    expect(result.current.isRecalculating).toBe(false)
  })

  it('reads it again once an edit raises the version', async () => {
    const { result } = renderHook(() => useCheckoutTotals(), { wrapper })
    await waitFor(() => expect(result.current.totals).toEqual(TOTALS))

    mockGetTotals.mockResolvedValue({ ...TOTALS, cartVersion: 5, total: 3600 })
    useCart.setState({ version: 5 })

    await waitFor(() => expect(result.current.totals?.total).toBe(3600))
  })

  // A quantity click is a new version: the last figures stand until its own arrive.
  it('keeps the last figures, marked as recalculating, while a new version is read', async () => {
    const { result } = renderHook(() => useCheckoutTotals(), { wrapper })
    await waitFor(() => expect(result.current.totals).toEqual(TOTALS))

    mockGetTotals.mockReturnValue(new Promise(() => {}))
    act(() => useCart.setState({ version: 5 }))

    await waitFor(() => expect(result.current.isRecalculating).toBe(true))
    expect(result.current.totals).toEqual(TOTALS)
  })

  it('asks nothing before the server has named a cart', () => {
    useCart.setState({ cartId: '', version: 0 })

    renderHook(() => useCheckoutTotals(), { wrapper })

    expect(mockGetTotals).not.toHaveBeenCalled()
  })

  it('reports a failed read', async () => {
    mockGetTotals.mockRejectedValue(new ApiError(503, 'INVENTORY_UNAVAILABLE'))

    const { result } = renderHook(() => useCheckoutTotals(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.totals).toBeUndefined()
  })
})
