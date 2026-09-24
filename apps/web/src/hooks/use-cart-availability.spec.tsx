import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  articleIdentityKey,
  type ArticleIdentityDto,
  type ArticlesAvailabilityDto,
} from '@vp-parts-shop/shared'
import type { CartLine } from './use-cart'
import { useCartAvailability } from './use-cart-availability'

const getAvailability = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  availabilityQueryOptions: (articles: ArticleIdentityDto[]) => ({
    queryKey: [
      'catalog',
      'availability',
      articles
        .map((article) => articleIdentityKey(article.brandId, article.articleNumber))
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
    quantity: 2,
    isSelected: true,
    addedAtPriceIncVat: null,
    ...overrides,
  }
}

function availabilityFor(item: CartLine): ArticlesAvailabilityDto {
  return {
    [articleIdentityKey(item.brandId, item.articleNumber)]: {
      available: true,
      bestPriceExVat: 1000,
      bestPriceIncVat: 1200,
      availabilityByWarehouse: [],
      computedAt: null,
    },
  }
}

function renderAvailability(lines: CartLine[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return renderHook(() => useCartAvailability(lines), { wrapper })
}

describe('useCartAvailability', () => {
  beforeEach(() => {
    getAvailability.mockReset()
  })

  it('reads nothing for an empty cart', () => {
    const { result } = renderAvailability([])

    expect(getAvailability).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(false)
    expect(result.current.rows).toEqual([])
  })

  it('is pending, with unpriced rows, until the read lands', () => {
    getAvailability.mockReturnValue(new Promise(() => {}))

    const { result } = renderAvailability([line()])

    expect(result.current.isPending).toBe(true)
    expect(result.current.hasPrices).toBe(false)
    expect(result.current.rows[0].availability).toBeUndefined()
  })

  it('prices the rows from the live read', async () => {
    const item = line()
    getAvailability.mockResolvedValue(availabilityFor(item))

    const { result } = renderAvailability([item])

    await waitFor(() => expect(result.current.hasPrices).toBe(true))
    expect(result.current.isPending).toBe(false)
    expect(result.current.rows[0].lineTotalIncVat).toBe(2400)
  })

  it('has no prices when the first read fails', async () => {
    getAvailability.mockRejectedValue(new Error('offline'))

    const { result } = renderAvailability([line()])

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.isPending).toBe(false)
    expect(result.current.hasPrices).toBe(false)
    expect(result.current.rows[0].availability).toBeNull()
  })

  it('keeps the prices on screen when a re-read fails', async () => {
    const item = line()
    getAvailability.mockResolvedValue(availabilityFor(item))
    const { result } = renderAvailability([item])
    await waitFor(() => expect(result.current.hasPrices).toBe(true))

    getAvailability.mockRejectedValue(new Error('offline'))
    act(() => {
      result.current.refetch()
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.hasPrices).toBe(true)
    expect(result.current.rows[0].lineTotalIncVat).toBe(2400)
  })
})
