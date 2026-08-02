import { render, screen } from '@testing-library/react'
import type { ArticlesAvailabilityDto } from '@vp-parts-shop/shared'
import { SearchResults, type SearchResultRow } from './search-results'
import { SearchEmptyState } from './search-empty-state'

function resultItem(
  overrides: Partial<SearchResultRow> = {},
): SearchResultRow {
  return {
    articleNumber: 'WL6340',
    brandId: '268',
    brandName: 'WIX',
    brandLogoUrl: null,
    description: 'Oil Filter',
    thumbnailUrl: null,
    technicalSpecs: [],
    oemNumbers: [],
    fitsVehicle: null,
    ...overrides,
  }
}

const availability: ArticlesAvailabilityDto = {
  WL6340: {
    available: true,
    bestPriceExVat: 1250,
    bestPriceIncVat: 1500,
    availabilityByWarehouse: [],
    computedAt: null,
  },
}

describe('SearchResults', () => {
  it('renders the query and result count', () => {
    render(
      <SearchResults
        query="WL634"
        total={2}
        results={[resultItem(), resultItem({ articleNumber: 'WL6341' })]}
      />,
    )

    expect(screen.getByText(/Резултати за „WL634/)).toBeInTheDocument()
    expect(screen.getByText(/2 намерени части/)).toBeInTheDocument()
  })

  // The API pages the hits, so the rows on screen are not the match count.
  it('counts every match, not just the hits on this page', () => {
    render(<SearchResults query="WL634" total={87} results={[resultItem()]} />)

    expect(screen.getByText(/87 намерени части/)).toBeInTheDocument()
  })

  it('says how many of the matches are on screen when they are paged', () => {
    render(
      <SearchResults
        query="WL634"
        total={87}
        results={[resultItem(), resultItem({ articleNumber: 'WL6341' })]}
      />,
    )

    expect(screen.getByText(/показани първите 2/)).toBeInTheDocument()
  })

  it('adds no paging note when every match is on screen', () => {
    render(<SearchResults query="WL634" total={1} results={[resultItem()]} />)

    expect(screen.queryByText(/показани първите/)).not.toBeInTheDocument()
  })

  it('links each result to its article detail page', () => {
    render(<SearchResults query="WL634" total={1} results={[resultItem()]} />)

    expect(screen.getByRole('link', { name: 'WL6340' })).toHaveAttribute(
      'href',
      '/catalog/articles/268/WL6340',
    )
  })

  it('renders the hits before availability arrives', () => {
    render(<SearchResults query="WL634" total={1} results={[resultItem()]} />)

    expect(screen.getByRole('link', { name: 'WL6340' })).toBeInTheDocument()
    expect(screen.getByTestId('article-row-buy-skeleton')).toBeInTheDocument()
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true')
  })

  it('shows the formatted price once availability is passed in', () => {
    render(
      <SearchResults
        query="WL634"
        total={1}
        results={[resultItem()]}
        availability={availability}
      />,
    )

    expect(screen.getByText(/15[.,]00/)).toBeInTheDocument()
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'false')
  })

  it('treats a hit missing from the availability map as unavailable', () => {
    render(
      <SearchResults
        query="WL634"
        total={1}
        results={[resultItem({ articleNumber: 'OC115' })]}
        availability={availability}
      />,
    )

    expect(screen.getByText('няма налично')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows a neutral unknown state when the availability read failed', () => {
    render(
      <SearchResults
        query="WL634"
        total={1}
        results={[resultItem()]}
        availability={null}
      />,
    )

    expect(screen.getByText('Няма данни')).toBeInTheDocument()
    expect(screen.queryByText('няма налично')).not.toBeInTheDocument()
  })

  // Search is vehicle-agnostic: the fit verdict belongs to the article detail
  // page, so a hit must not show one even if the API starts sending it.
  it('shows no fit verdict, whichever way the API resolves it', () => {
    const { rerender } = render(
      <SearchResults
        query="WL634"
        total={1}
        results={[resultItem({ fitsVehicle: true })]}
      />,
    )
    expect(screen.queryByText(/подходяща за/i)).not.toBeInTheDocument()

    rerender(
      <SearchResults
        query="WL634"
        total={1}
        results={[resultItem({ fitsVehicle: false })]}
      />,
    )
    expect(screen.queryByText(/подходяща за/i)).not.toBeInTheDocument()
  })
})

describe('SearchEmptyState', () => {
  it('shows the query in the no-results message', () => {
    render(<SearchEmptyState query="XXXX999" />)

    expect(
      screen.getByText(/Няма намерени части за „XXXX999"/),
    ).toBeInTheDocument()
  })

  it('shows a prompt to enter a query when the query is blank', () => {
    render(<SearchEmptyState query="" />)

    expect(screen.getByText(/Въведете номер на част/)).toBeInTheDocument()
  })

  it('offers vehicle search and category navigation links', () => {
    render(<SearchEmptyState query="XXXX999" />)

    expect(
      screen.getByRole('link', { name: 'Търси по автомобил' }),
    ).toHaveAttribute('href', '/vehicles')
    expect(
      screen.getByRole('link', { name: 'Разгледай категориите' }),
    ).toHaveAttribute('href', '/')
  })

  it('offers a contact-the-store prompt', () => {
    render(<SearchEmptyState query="XXXX999" />)

    expect(
      screen.getByRole('link', { name: 'Свържете се с нас' }),
    ).toBeInTheDocument()
  })

  it('renders "did you mean" suggestions when provided', () => {
    const suggestions = [
      {
        kind: 'article' as const,
        articleNumber: 'XXXX900',
        brandId: '268',
        brandName: 'WIX',
        description: 'Oil Filter',
      },
      {
        kind: 'article' as const,
        articleNumber: 'XXXX901',
        brandId: '268',
        brandName: 'BOSCH',
        description: 'Air Filter',
      },
    ]
    render(<SearchEmptyState query="XXXX999" suggestions={suggestions} />)

    expect(screen.getByText('Може би търсите:')).toBeInTheDocument()
    expect(screen.getByText('XXXX900')).toBeInTheDocument()
    expect(screen.getByText('XXXX901')).toBeInTheDocument()
  })

  it('links each suggestion to its article detail page', () => {
    const suggestions = [
      {
        kind: 'article' as const,
        articleNumber: 'WA6546',
        brandId: '268',
        brandName: 'WIX',
        description: 'Air Filter',
      },
    ]
    render(<SearchEmptyState query="WA6456" suggestions={suggestions} />)

    const link = screen.getByRole('link', { name: /WA6546/ })
    expect(link).toHaveAttribute('href', '/catalog/articles/268/WA6546')
  })

  it('does not render the suggestions section when suggestions are absent', () => {
    render(<SearchEmptyState query="XXXX999" />)

    expect(screen.queryByText('Може би търсите:')).not.toBeInTheDocument()
  })

  it('does not render the suggestions section when suggestions is an empty array', () => {
    render(<SearchEmptyState query="XXXX999" suggestions={[]} />)

    expect(screen.queryByText('Може би търсите:')).not.toBeInTheDocument()
  })
})
