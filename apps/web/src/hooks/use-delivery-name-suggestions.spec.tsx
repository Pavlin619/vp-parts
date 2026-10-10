import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { ShippingMethod } from '@vp-parts-shop/shared'
import { apiFetch } from '@/lib/api'
import { useDeliveryNameSuggestions } from './use-delivery-name-suggestions'

jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), apiFetch: jest.fn() }))
jest.mock('@/lib/api/cart/cart-fetch')

const mockApiFetch = jest.mocked(apiFetch)

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useDeliveryNameSuggestions', () => {
  beforeEach(() => mockApiFetch.mockReset())

  it('returns the names the carrier lists for what was typed', async () => {
    mockApiFetch.mockResolvedValue([
      { id: '1', name: 'бул. Витоша' },
      { id: '2', name: 'ул. Витошка' },
    ])

    const { result } = renderHook(
      () => useDeliveryNameSuggestions('streets', ShippingMethod.ECONT, '41', 'вито'),
      { wrapper },
    )

    await waitFor(() => expect(result.current).toEqual(['бул. Витоша', 'ул. Витошка']))
  })

  it('stays silent until a place is chosen', async () => {
    const { result } = renderHook(
      () => useDeliveryNameSuggestions('quarters', ShippingMethod.ECONT, null, 'мла'),
      { wrapper },
    )

    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(result.current).toEqual([])
    expect(mockApiFetch).not.toHaveBeenCalled()
  })
})
