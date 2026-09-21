import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { CartDto } from '@vp-parts-shop/shared'
import * as cartApi from '@/lib/api/cart'
import { useCart } from './use-cart'
import { useCartSync } from './use-cart-sync'

jest.mock('@/lib/api/cart')

const api = jest.mocked(cartApi)

const SERVER_CART: CartDto = {
  id: 'cart-1',
  version: 4,
  lines: [
    {
      brandId: '268',
      articleNumber: 'WL6340',
      brandName: 'WIX',
      brandLogoUrl: null,
      description: 'Маслен филтър',
      thumbnailUrl: null,
      quantity: 2,
      isSelected: true,
      addedAtPriceIncVat: 1900,
      addedAt: '2026-09-01T10:00:00.000Z',
    },
  ],
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useCartSync', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useCart.setState({ lines: [], cartId: '', version: 0, lastWriteError: null })
  })

  it('takes the server cart into the mirror', async () => {
    api.getCart.mockResolvedValue(SERVER_CART)

    const { result } = renderHook(() => useCartSync(), { wrapper })

    await waitFor(() => expect(useCart.getState().version).toBe(4))
    expect(useCart.getState().lines).toHaveLength(1)
    expect(result.current.isError).toBe(false)
  })

  // The mirror is what the badge and the drawer paint from on a cold load.
  it('leaves the mirror alone while the read is in flight', () => {
    api.getCart.mockReturnValue(new Promise(() => {}))
    useCart.setState({
      lines: [
        {
          brandId: '268',
          articleNumber: 'MIRRORED',
          brandName: 'WIX',
          brandLogoUrl: null,
          description: 'Маслен филтър',
          thumbnailUrl: null,
          quantity: 1,
          isSelected: true,
          addedAtPriceIncVat: null,
        },
      ],
    })

    renderHook(() => useCartSync(), { wrapper })

    expect(useCart.getState().lines[0].articleNumber).toBe('MIRRORED')
  })

  it('keeps the mirrored lines when the read fails', async () => {
    api.getCart.mockRejectedValue(new Error('offline'))
    useCart.setState({
      lines: [
        {
          brandId: '268',
          articleNumber: 'MIRRORED',
          brandName: 'WIX',
          brandLogoUrl: null,
          description: 'Маслен филтър',
          thumbnailUrl: null,
          quantity: 1,
          isSelected: true,
          addedAtPriceIncVat: null,
        },
      ],
    })

    const { result } = renderHook(() => useCartSync(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(useCart.getState().lines).toHaveLength(1)
  })

  // Nothing else surfaces a failed background sync, so the banner every other
  // cart surface already renders is what has to say this happened.
  it('names a failed read as the reason the sync banner shows', async () => {
    api.getCart.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useCartSync(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(useCart.getState().lastWriteError).toEqual({ code: 'SYNC_FAILED' })
  })

  it('does not let the sync failure replace a more specific write error', async () => {
    api.getCart.mockRejectedValue(new Error('offline'))
    useCart.setState({ lastWriteError: { code: 'CART_FULL' } })

    const { result } = renderHook(() => useCartSync(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(useCart.getState().lastWriteError).toEqual({ code: 'CART_FULL' })
  })

  // A background refetch (e.g. on window focus) can return the pre-write
  // snapshot while an optimistic add is still in flight, at the same version
  // the mirror already shows — adopting it would make the add vanish.
  it('does not let a background read undo a write still in flight', async () => {
    useCart.setState({ cartId: 'cart-1', version: 2 })
    let resolveGetCart!: (cart: CartDto) => void
    api.getCart.mockReturnValue(
      new Promise((resolve) => {
        resolveGetCart = resolve
      }),
    )
    api.addCartLine.mockReturnValue(new Promise(() => {}))

    renderHook(() => useCartSync(), { wrapper })

    useCart.getState().addLine(
      {
        brandId: '268',
        articleNumber: 'WL6340',
        brandName: 'WIX',
        brandLogoUrl: null,
        description: 'Маслен филтър',
        thumbnailUrl: null,
      },
      1,
    )
    expect(useCart.getState().lines).toHaveLength(1)

    resolveGetCart({ id: 'cart-1', version: 2, lines: [] })

    // Nothing distinguishes "the effect hasn't run yet" from "the fix skipped
    // it" via a positive assertion, so give both the resolved fetch and the
    // effect it feeds a moment to flush before checking the mirror held.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(useCart.getState().lines).toHaveLength(1)
  })
})

