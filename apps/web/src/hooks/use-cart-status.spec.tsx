import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { EMPTY_CART } from '@vp-parts-shop/shared'
import { cartQueryOptions } from '@/lib/api/cart'
import { useCart, type CartLine } from './use-cart'
import { useCartStatus } from './use-cart-status'

function line(): CartLine {
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
  }
}

function withQueryClient(queryClient = new QueryClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function Probe() {
  return <span>{useCartStatus()}</span>
}

describe('useCartStatus', () => {
  beforeEach(() => {
    useCart.setState({ lines: [] })
  })

  it('is loading on the server, whatever the mirror holds', () => {
    useCart.setState({ lines: [line()] })
    const Wrapper = withQueryClient()

    expect(
      renderToString(
        <Wrapper>
          <Probe />
        </Wrapper>,
      ),
    ).toBe('<span>loading</span>')
  })

  it('is ready once the mirror holds lines', () => {
    useCart.setState({ lines: [line()] })

    const { result } = renderHook(() => useCartStatus(), { wrapper: withQueryClient() })

    expect(result.current).toBe('ready')
  })

  // Even a guest with no token waits: the read first waits for Clerk to say
  // whether this is a signed-in customer, whose cart the account names.
  it('waits for the server before calling an empty mirror empty', () => {
    const { result } = renderHook(() => useCartStatus(), { wrapper: withQueryClient() })

    expect(result.current).toBe('loading')
  })

  it('is empty once the server has answered with no lines', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(cartQueryOptions.queryKey, EMPTY_CART)

    const { result } = renderHook(() => useCartStatus(), {
      wrapper: withQueryClient(queryClient),
    })

    expect(result.current).toBe('empty')
  })
})
