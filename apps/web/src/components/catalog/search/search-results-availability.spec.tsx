import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type {
  ArticlesAvailabilityDto,
  ArticleSummaryDto,
} from '@vp-parts-shop/shared'
import { SearchResultsAvailability } from './search-results-availability'

const availabilityMock = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  availabilityQueryOptions: (articleNumbers: string[]) => ({
    queryKey: ['catalog', 'availability', [...articleNumbers].sort().join(',')],
    queryFn: () =>
      availabilityMock(articleNumbers) as Promise<ArticlesAvailabilityDto>,
  }),
}))

const results: ArticleSummaryDto[] = [
  {
    articleNumber: 'WL6340',
    brandName: 'WIX',
    brandLogoUrl: null,
    description: 'Oil Filter',
    thumbnailUrl: null,
    technicalSpecs: [],
    oemNumbers: [],
    fitsVehicle: null,
  },
  {
    articleNumber: 'OC115',
    brandName: 'MANN',
    brandLogoUrl: null,
    description: 'Oil Filter',
    thumbnailUrl: null,
    technicalSpecs: [],
    oemNumbers: [],
    fitsVehicle: null,
  },
]

function renderResults() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SearchResultsAvailability query="WL634" results={results} />
    </QueryClientProvider>,
  )
}

describe('SearchResultsAvailability', () => {
  beforeEach(() => {
    availabilityMock.mockReset()
  })

  it('shows a skeleton while the availability read is in flight', () => {
    availabilityMock.mockReturnValue(new Promise(() => {}))
    renderResults()

    expect(screen.getByLabelText('Зареждане на резултатите')).toBeInTheDocument()
  })

  it('merges availability onto the metadata rows on success', async () => {
    availabilityMock.mockResolvedValue({
      WL6340: {
        available: true,
        bestPriceExVat: 1250,
        bestPriceIncVat: 1500,
        availabilityByWarehouse: [],
        computedAt: null,
      },
    } satisfies ArticlesAvailabilityDto)

    renderResults()

    // WL6340 hydrates to its price; OC115 has no row and degrades to unavailable.
    expect(await screen.findByText(/15[.,]00/)).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Временно изчерпан')).toBeInTheDocument()
  })

  it('shows a scoped retry state when the read fails closed', async () => {
    const user = userEvent.setup()
    availabilityMock.mockRejectedValue(new Error('inventory unavailable'))

    renderResults()

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))
    expect(availabilityMock).toHaveBeenCalledTimes(2)
  })
})
