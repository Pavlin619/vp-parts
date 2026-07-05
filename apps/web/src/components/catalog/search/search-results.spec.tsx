import React from 'react'
import { render, screen } from '@testing-library/react'
import type { SearchResultItemDto } from '@vp-parts-shop/shared'
import { SearchResults } from './search-results'
import { SearchEmptyState } from './search-empty-state'

function resultItem(
  overrides: Partial<SearchResultItemDto> = {},
): SearchResultItemDto {
  return {
    articleNumber: 'WL6340',
    brandName: 'WIX',
    description: 'Oil Filter',
    available: true,
    bestPriceIncVat: 1500,
    fitsVehicle: null,
    ...overrides,
  }
}

describe('SearchResults', () => {
  it('renders the query and result count', () => {
    render(
      <SearchResults
        query="WL634"
        results={[resultItem(), resultItem({ articleNumber: 'WL6341' })]}
      />,
    )

    expect(screen.getByText(/Резултати за „WL634/)).toBeInTheDocument()
    expect(screen.getByText(/2 намерени части/)).toBeInTheDocument()
  })

  it('links each result to its article detail page', () => {
    render(<SearchResults query="WL634" results={[resultItem()]} />)

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/catalog/articles/WL6340',
    )
  })

  it('URL-encodes special characters in the article link', () => {
    render(
      <SearchResults
        query="BD"
        results={[resultItem({ articleNumber: 'BD 0986/451' })]}
      />,
    )

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      `/catalog/articles/${encodeURIComponent('BD 0986/451')}`,
    )
  })

  it('shows the formatted price for available articles', () => {
    render(<SearchResults query="WL634" results={[resultItem()]} />)

    expect(screen.getByText(/15[.,]00/)).toBeInTheDocument()
  })

  it('shows a dash instead of a price for unavailable articles', () => {
    render(
      <SearchResults
        query="WL634"
        results={[resultItem({ available: false, bestPriceIncVat: null })]}
      />,
    )

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Временно изчерпан')).toBeInTheDocument()
  })

  it('shows a positive fit indicator when the part fits the vehicle', () => {
    render(
      <SearchResults
        query="WL634"
        results={[resultItem({ fitsVehicle: true })]}
      />,
    )

    expect(
      screen.getByText('Подходяща за вашия автомобил'),
    ).toBeInTheDocument()
  })

  it('shows a negative fit indicator when the part does not fit', () => {
    render(
      <SearchResults
        query="WL634"
        results={[resultItem({ fitsVehicle: false })]}
      />,
    )

    expect(
      screen.getByText('Не е подходяща за вашия автомобил'),
    ).toBeInTheDocument()
  })

  it('omits the fit indicator when no vehicle is selected', () => {
    render(<SearchResults query="WL634" results={[resultItem()]} />)

    expect(
      screen.queryByText(/за вашия автомобил/),
    ).not.toBeInTheDocument()
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

    expect(
      screen.getByText(/Въведете номер на част/),
    ).toBeInTheDocument()
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
      { articleNumber: 'XXXX900', brandName: 'WIX', description: 'Oil Filter' },
      { articleNumber: 'XXXX901', brandName: 'BOSCH', description: 'Air Filter' },
    ]
    render(<SearchEmptyState query="XXXX999" suggestions={suggestions} />)

    expect(screen.getByText('Може би търсите:')).toBeInTheDocument()
    expect(screen.getByText('XXXX900')).toBeInTheDocument()
    expect(screen.getByText('XXXX901')).toBeInTheDocument()
  })

  it('links each suggestion to its article detail page', () => {
    const suggestions = [
      { articleNumber: 'WA6546', brandName: 'WIX', description: 'Air Filter' },
    ]
    render(<SearchEmptyState query="WA6456" suggestions={suggestions} />)

    const link = screen.getByRole('link', { name: /WA6546/ })
    expect(link).toHaveAttribute('href', '/catalog/articles/WA6546')
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
