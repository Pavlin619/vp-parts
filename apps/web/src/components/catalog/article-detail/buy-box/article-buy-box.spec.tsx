import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type {
  ArticlesAvailabilityDto,
  WarehouseAvailabilityDto,
  WarehouseId,
} from '@vp-parts-shop/shared'
import { ArticleBuyBox } from './article-buy-box'

// The wrapper fetches availability through this factory; the content component
// is tested separately (article-buy-box-content.spec) with resolved props.
const availabilityMock = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  availabilityQueryOptions: (articleNumbers: string[]) => ({
    queryKey: ['catalog', 'availability', [...articleNumbers].sort().join(',')],
    queryFn: () => availabilityMock(articleNumbers) as Promise<ArticlesAvailabilityDto>,
  }),
}))

function warehouse(
  warehouseId: WarehouseId,
  quantity: number,
): WarehouseAvailabilityDto {
  return {
    warehouseId,
    quantity,
    deliveryWorkDays: 0,
    orderCutoffTime: '18:00',
    cutoffAt: '2099-06-25T15:00:00.000Z',
    pickup: { earliestAt: '2020-01-06T08:00:00.000Z', granularity: 'DAY' },
    courier: { earliestAt: '2020-01-07T08:00:00.000Z', granularity: 'DAY' },
  }
}

function renderBuyBox() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ArticleBuyBox articleNumber="WL6340" fitsVehicle={null} />
    </QueryClientProvider>,
  )
}

describe('ArticleBuyBox — live availability', () => {
  beforeEach(() => {
    availabilityMock.mockReset()
  })

  it('shows the skeleton while the availability read is in flight', () => {
    availabilityMock.mockReturnValue(new Promise(() => {}))
    renderBuyBox()

    expect(screen.getByTestId('article-buy-box-skeleton')).toBeInTheDocument()
  })

  it('renders the buy box from the fetched availability on success', async () => {
    availabilityMock.mockResolvedValue({
      WL6340: {
        available: true,
        bestPriceExVat: 7017,
        bestPriceIncVat: 8420,
        availabilityByWarehouse: [warehouse('CENTRAL', 4)],
        computedAt: '2026-07-05T09:00:00.000Z',
      },
    } satisfies ArticlesAvailabilityDto)

    renderBuyBox()

    expect(
      await screen.findByRole('button', { name: /Добави в кошницата/ }),
    ).toBeInTheDocument()
  })

  it('shows a scoped retry state when the read fails closed', async () => {
    const user = userEvent.setup()
    availabilityMock.mockRejectedValue(new Error('inventory unavailable'))

    renderBuyBox()

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))
    // Retry re-runs the read (initial call + the retry).
    expect(availabilityMock).toHaveBeenCalledTimes(2)
  })
})
