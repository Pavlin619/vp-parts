import { render, screen } from '@testing-library/react'
import {
  articleIdentityKey,
  type ArticlesAvailabilityDto,
} from '@vp-parts-shop/shared'
import { SearchResults, type SearchResultRow } from './search-results'

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
    fitsVehicle: null,
    ...overrides,
  }
}

const WIX = '268'

const availability: ArticlesAvailabilityDto = {
  [articleIdentityKey(WIX, 'WL6340')]: {
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

  // Which slice of the matches is on screen is the pager's line; repeating it
  // here let the two drift apart once filters could shrink the result set.
  it('leaves the on-screen range to the pager', () => {
    render(
      <SearchResults
        query="WL634"
        total={87}
        results={[resultItem(), resultItem({ articleNumber: 'WL6341' })]}
      />,
    )

    expect(screen.queryByText(/показани първите/)).not.toBeInTheDocument()
  })

  // The pager is built by the server page and handed down as a slot, which
  // keeps URL building out of the client subtree this renders in.
  it('renders the pager it was given beside the match count', () => {
    render(
      <SearchResults
        query="WL634"
        total={87}
        results={[resultItem()]}
        pager={<span>1/5</span>}
      />,
    )

    expect(screen.getByText(/87 намерени части/)).toBeInTheDocument()
    expect(screen.getByText('1/5')).toBeInTheDocument()
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
