import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type {
  ArticleInventoryDetailDto,
  ArticleSummaryDto,
} from '@vp-parts-shop/shared'
import { ArticleRowSubstitutes } from './article-row-substitutes'

const substitutesMock = jest.fn()
const availabilityMock = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  substitutesQueryOptions: (articleNumber: string) => ({
    queryKey: ['catalog', 'substitutes', articleNumber],
    queryFn: () => substitutesMock(articleNumber) as Promise<unknown>,
  }),
  availabilityQueryOptions: (articleNumbers: string[]) => ({
    queryKey: ['catalog', 'availability', [...articleNumbers].sort().join(',')],
    queryFn: () => availabilityMock(articleNumbers) as Promise<unknown>,
  }),
}))

function substitute(
  overrides: Partial<ArticleSummaryDto> = {},
): ArticleSummaryDto {
  return {
    articleNumber: 'OC 115',
    brandId: '77',
    brandName: 'MANN-FILTER',
    brandLogoUrl: null,
    description: 'Маслен филтър',
    thumbnailUrl: null,
    technicalSpecs: [],
    oemNumbers: [],
    fitsVehicle: null,
    ...overrides,
  }
}

function detail(
  overrides: Partial<ArticleInventoryDetailDto> = {},
): ArticleInventoryDetailDto {
  return {
    available: true,
    bestPriceExVat: 1250,
    bestPriceIncVat: 1500,
    availabilityByWarehouse: [],
    computedAt: null,
    ...overrides,
  }
}

const pending = () => new Promise(() => {})

function renderSubstitutes(articleNumber = 'WL6340') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <ArticleRowSubstitutes articleNumber={articleNumber} />
    </QueryClientProvider>,
  )
}

describe('ArticleRowSubstitutes', () => {
  beforeEach(() => {
    substitutesMock.mockReset()
    availabilityMock.mockReset()
    substitutesMock.mockResolvedValue([])
    availabilityMock.mockResolvedValue({})
  })

  it('fetches the substitutes for the article it is mounted for', () => {
    substitutesMock.mockReturnValue(pending())

    renderSubstitutes('OF-WL7090')

    expect(substitutesMock).toHaveBeenCalledWith('OF-WL7090')
  })

  it('shows a skeleton while the substitutes are in flight', () => {
    substitutesMock.mockReturnValue(pending())

    renderSubstitutes()

    expect(
      screen.getByTestId('article-row-substitutes-skeleton'),
    ).toBeInTheDocument()
  })

  it('renders each substitute as a catalog row of its own', async () => {
    substitutesMock.mockResolvedValue([
      substitute(),
      substitute({
        articleNumber: 'WL7090',
        brandId: '268',
        brandName: 'WIX Filters',
      }),
    ])

    renderSubstitutes()

    expect(await screen.findByRole('link', { name: 'OC 115' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'WL7090' })).toBeInTheDocument()
    expect(screen.getByText('MANN-FILTER')).toBeInTheDocument()
    expect(screen.getByText('WIX Filters')).toBeInTheDocument()
  })

  // Each substitute is a part in its own right, so the row links to its own
  // brand-scoped detail page rather than back to the part being replaced.
  it('links each row to its own article detail page', async () => {
    substitutesMock.mockResolvedValue([substitute()])

    renderSubstitutes()

    expect(await screen.findByRole('link', { name: 'OC 115' })).toHaveAttribute(
      'href',
      `/catalog/articles/77/${encodeURIComponent('OC 115')}`,
    )
  })

  // Two brands can file the same number, so a row keyed on the number alone
  // would drop one of them.
  it('keeps two brands of one number apart', async () => {
    substitutesMock.mockResolvedValue([
      substitute({ articleNumber: 'OX 982D', brandId: '77', brandName: 'MANN' }),
      substitute({ articleNumber: 'OX 982D', brandId: '30', brandName: 'HENGST' }),
    ])
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    renderSubstitutes()

    expect(await screen.findAllByRole('link', { name: 'OX 982D' })).toHaveLength(2)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  // The substitutes read is cacheable catalog metadata; price and stock are
  // live, so the rows hydrate from the same bulk availability read every other
  // list surface uses.
  it('hydrates the rows with live availability for the substitute numbers', async () => {
    substitutesMock.mockResolvedValue([
      substitute(),
      substitute({ articleNumber: 'WL7090', brandId: '268' }),
    ])
    availabilityMock.mockResolvedValue({ 'OC 115': detail() })

    renderSubstitutes()

    expect(await screen.findByText(/15[.,]00/)).toBeInTheDocument()
    expect(availabilityMock).toHaveBeenCalledWith(['OC 115', 'WL7090'])
  })

  // Nothing may be read until a visitor opens the section, and the numbers to
  // price are not known until the substitutes themselves land.
  it('does not read availability before the substitutes arrive', () => {
    substitutesMock.mockReturnValue(pending())

    renderSubstitutes()

    expect(availabilityMock).not.toHaveBeenCalled()
  })

  // A substitute is a part in its own right, and comparing it against the one
  // you came for is what its specs are for — so the nested rows keep their
  // expander, substitutes section included.
  it('lets a substitute row be expanded for its own detail', async () => {
    const user = userEvent.setup()
    substitutesMock.mockResolvedValue([
      substitute({ technicalSpecs: [{ key: 'Височина', value: '79 mm' }] }),
    ])

    renderSubstitutes()

    await user.click(
      await screen.findByRole('button', {
        name: 'Допълнителна информация за OC 115',
      }),
    )

    expect(screen.getByText('79 mm')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Заменяеми/ }),
    ).toBeInTheDocument()
  })

  // Nesting is unbounded on purpose, but it stays a visitor's choice: opening a
  // substitute must not read that substitute's own cross-references until they
  // ask for them.
  it('does not read a nested row\u2019s substitutes when it is merely expanded', async () => {
    const user = userEvent.setup()
    substitutesMock.mockResolvedValue([
      substitute({ technicalSpecs: [{ key: 'Височина', value: '79 mm' }] }),
    ])

    renderSubstitutes('WL6340')

    await user.click(
      await screen.findByRole('button', {
        name: 'Допълнителна информация за OC 115',
      }),
    )

    expect(substitutesMock).toHaveBeenCalledTimes(1)
    expect(substitutesMock).not.toHaveBeenCalledWith('OC 115')
  })

  it('reports an article TecDoc has no substitutes for', async () => {
    substitutesMock.mockResolvedValue([])

    renderSubstitutes()

    expect(await screen.findByText(/Няма заменяеми части/)).toBeInTheDocument()
    expect(availabilityMock).not.toHaveBeenCalled()
  })

  it('offers a retry when the substitutes read fails', async () => {
    const user = userEvent.setup()
    substitutesMock.mockRejectedValue(new Error('catalog unavailable'))

    renderSubstitutes()

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))
    expect(substitutesMock).toHaveBeenCalledTimes(2)
  })

  // A stock-DB blip must not hide substitutes we already have the metadata
  // for, and must never read as "none of these are available".
  it('keeps the rows when the availability read fails, and offers a retry', async () => {
    const user = userEvent.setup()
    substitutesMock.mockResolvedValue([substitute()])
    availabilityMock.mockRejectedValue(new Error('inventory unavailable'))

    renderSubstitutes()

    expect(await screen.findByText('Няма данни')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'OC 115' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))
    expect(availabilityMock).toHaveBeenCalledTimes(2)
  })
})
