import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  articleIdentityKey,
  type ArticleIdentityDto,
  type ArticleListItemDto,
  type ArticlesAvailabilityDto,
  type PaginatedCatalogArticlesDto,
} from '@vp-parts-shop/shared'
import { ArticleGridAvailability } from './article-grid-availability'

const availabilityMock = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  availabilityQueryOptions: (articles: ArticleIdentityDto[]) => ({
    queryKey: ['catalog', 'availability', identityKeys(articles).sort().join(',')],
    queryFn: () => availabilityMock(articles) as Promise<ArticlesAvailabilityDto>,
  }),
}))

/** The key both the request and the response map are built from. */
function identityKeys(articles: ArticleIdentityDto[]): string[] {
  return articles.map((article) =>
    articleIdentityKey(article.brandId, article.articleNumber),
  )
}

// Keep the test focused on the fetch/merge orchestration, not card rendering.
jest.mock('./article-grid', () => ({
  ArticleGrid: ({
    articles,
    total,
  }: {
    articles: ArticleListItemDto[]
    total: number
  }) => (
    <ul data-testid="article-grid" data-total={total}>
      {articles.map((article) => (
        <li key={article.articleNumber}>
          {article.articleNumber}:{String(article.available)}
        </li>
      ))}
    </ul>
  ),
}))

const metadata: PaginatedCatalogArticlesDto = {
  total: 2,
  page: 1,
  pageSize: 20,
  items: [
    {
      articleNumber: 'A-001',
      brandId: '268',
      brandName: 'Bosch',
      brandLogoUrl: null,
      description: 'Filter',
      thumbnailUrl: null,
      technicalSpecs: [],
      fitsVehicle: null,
    },
    {
      articleNumber: 'A-002',
      brandId: '268',
      brandName: 'MANN',
      brandLogoUrl: null,
      description: 'Filter',
      thumbnailUrl: null,
      technicalSpecs: [],
      fitsVehicle: null,
    },
  ],
}

function renderGrid() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ArticleGridAvailability metadata={metadata} />
    </QueryClientProvider>,
  )
}

describe('ArticleGridAvailability', () => {
  beforeEach(() => {
    availabilityMock.mockReset()
  })

  it('shows a skeleton while the bulk availability read is in flight', () => {
    availabilityMock.mockReturnValue(new Promise(() => {}))
    renderGrid()

    expect(screen.getByLabelText('Зареждане на части')).toBeInTheDocument()
  })

  it('merges availability onto the metadata rows on success', async () => {
    availabilityMock.mockResolvedValue({
      [articleIdentityKey('268', 'A-001')]: {
        available: true,
        bestPriceExVat: 1000,
        bestPriceIncVat: 1200,
        availabilityByWarehouse: [],
        computedAt: null,
      },
    } satisfies ArticlesAvailabilityDto)

    renderGrid()

    const grid = await screen.findByTestId('article-grid')
    // A-001 hydrates to available; A-002 has no row and degrades to unavailable.
    expect(within(grid).getByText('A-001:true')).toBeInTheDocument()
    expect(within(grid).getByText('A-002:false')).toBeInTheDocument()
  })

  it('shows a scoped retry state when the bulk read fails closed', async () => {
    const user = userEvent.setup()
    availabilityMock.mockRejectedValue(new Error('inventory unavailable'))

    renderGrid()

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))
    expect(availabilityMock).toHaveBeenCalledTimes(2)
  })
})
