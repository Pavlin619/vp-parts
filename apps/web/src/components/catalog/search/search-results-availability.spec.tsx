import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  articleIdentityKey,
  type ArticleIdentityDto,
  type ArticlesAvailabilityDto,
  type ArticleSummaryDto,
} from '@vp-parts-shop/shared'
import { SearchResultsAvailability } from './search-results-availability'

const availabilityMock = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  availabilityQueryOptions: (articles: ArticleIdentityDto[]) => ({
    queryKey: ['catalog', 'availability', identityKeys(articles).sort().join(',')],
    queryFn: () =>
      availabilityMock(articles) as Promise<ArticlesAvailabilityDto>,
  }),
}))

/** The key both the request and the response map are built from. */
function identityKeys(articles: ArticleIdentityDto[]): string[] {
  return articles.map((article) =>
    articleIdentityKey(article.brandId, article.articleNumber),
  )
}

const results: ArticleSummaryDto[] = [
  {
    articleNumber: 'WL6340',
    brandId: '268',
    brandName: 'WIX',
    brandLogoUrl: null,
    description: 'Oil Filter',
    thumbnailUrl: null,
    technicalSpecs: [],
    fitsVehicle: null,
  },
  {
    articleNumber: 'OC115',
    brandId: '268',
    brandName: 'MANN',
    brandLogoUrl: null,
    description: 'Oil Filter',
    thumbnailUrl: null,
    technicalSpecs: [],
    fitsVehicle: null,
  },
]

const WL6340_AVAILABILITY: ArticlesAvailabilityDto = {
  [articleIdentityKey('268', 'WL6340')]: {
    available: true,
    bestPriceExVat: 1250,
    bestPriceIncVat: 1500,
    availabilityByWarehouse: [],
    computedAt: null,
  },
}

function renderResults(pager?: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <SearchResultsAvailability
        query="WL634"
        results={results}
        total={results.length}
        pager={pager}
      />
    </QueryClientProvider>,
  )

  return { queryClient }
}

describe('SearchResultsAvailability', () => {
  beforeEach(() => {
    availabilityMock.mockReset()
  })

  it('renders the hits immediately and skeletons only the inventory columns', () => {
    availabilityMock.mockReturnValue(new Promise(() => {}))
    renderResults()

    expect(screen.getByRole('link', { name: 'WL6340' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'OC115' })).toBeInTheDocument()
    expect(screen.getAllByTestId('article-row-buy-skeleton')).toHaveLength(2)
  })

  it('forwards the server-rendered pager down to the results', () => {
    availabilityMock.mockReturnValue(new Promise(() => {}))
    renderResults(<span>1/5</span>)

    expect(screen.getByText('1/5')).toBeInTheDocument()
  })

  it('merges availability onto the rows on success', async () => {
    availabilityMock.mockResolvedValue(WL6340_AVAILABILITY)

    renderResults()

    // WL6340 hydrates to its price; OC115 has no row and degrades to unavailable.
    expect(await screen.findByText(/15[.,]00/)).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('няма налично')).toBeInTheDocument()
  })

  it('keeps the hits visible behind a scoped retry when the read fails closed', async () => {
    const user = userEvent.setup()
    availabilityMock.mockRejectedValue(new Error('inventory unavailable'))

    renderResults()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'WL6340' })).toBeInTheDocument()
    expect(screen.getAllByText('Няма данни')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))
    expect(availabilityMock).toHaveBeenCalledTimes(2)
  })

  // A refetch (tab refocus, retry) that fails leaves the last good read in the
  // cache. Dropping it would blank prices the visitor can already see.
  it('keeps the prices it already has when a later read fails', async () => {
    availabilityMock.mockResolvedValueOnce(WL6340_AVAILABILITY)
    const { queryClient } = renderResults()
    expect(await screen.findByText(/15[.,]00/)).toBeInTheDocument()

    availabilityMock.mockRejectedValue(new Error('inventory unavailable'))
    await act(async () => {
      await queryClient.refetchQueries()
    })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/15[.,]00/)).toBeInTheDocument()
    expect(screen.queryByText('Няма данни')).not.toBeInTheDocument()
  })

  it('warns that the prices it kept may be out of date', async () => {
    availabilityMock.mockResolvedValueOnce(WL6340_AVAILABILITY)
    const { queryClient } = renderResults()
    expect(await screen.findByText(/15[.,]00/)).toBeInTheDocument()

    availabilityMock.mockRejectedValue(new Error('inventory unavailable'))
    await act(async () => {
      await queryClient.refetchQueries()
    })

    expect(
      await screen.findByText('Показаните наличности може да не са актуални.'),
    ).toBeInTheDocument()
  })
})
