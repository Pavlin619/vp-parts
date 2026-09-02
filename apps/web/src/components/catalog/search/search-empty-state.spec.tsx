import { render, screen } from '@testing-library/react'
import { SearchMode, type AutocompleteItemDto } from '@vp-parts-shop/shared'
import { newSearch } from '@/lib/catalog/search-url'
import { SearchEmptyState } from './search-empty-state'

function numberSearch(query: string) {
  return newSearch({ query, mode: SearchMode.PartNumber })
}

function hrefOf(name: RegExp | string): string {
  return decodeURIComponent(
    screen.getByRole('link', { name }).getAttribute('href') ?? '',
  )
}

describe('SearchEmptyState', () => {
  it('names the query that found nothing', () => {
    render(<SearchEmptyState state={numberSearch('XXXX999')} />)

    expect(
      screen.getByText(/Няма намерени части за „XXXX999"/),
    ).toBeInTheDocument()
  })

  it('prompts for a query when nothing was searched for yet', () => {
    render(<SearchEmptyState state={numberSearch('')} />)

    expect(screen.getByText(/Въведете номер на част/)).toBeInTheDocument()
  })

  it('offers vehicle search and category navigation', () => {
    render(<SearchEmptyState state={numberSearch('XXXX999')} />)

    expect(hrefOf('Търси по автомобил')).toBe('/vehicles')
    expect(hrefOf('Разгледай категориите')).toBe('/')
  })

  it('offers a contact-the-store prompt', () => {
    render(<SearchEmptyState state={numberSearch('XXXX999')} />)

    expect(
      screen.getByRole('link', { name: 'Свържете се с нас' }),
    ).toBeInTheDocument()
  })

  describe('the way out of the number lane', () => {
    // The number lane cannot match prose at all, so re-running the same words
    // as free text is the likeliest fix — and it must not lose the query.
    it.each([SearchMode.PartNumber, SearchMode.PartNumberExact])(
      'offers a descriptive retry from %s',
      (mode) => {
        render(
          <SearchEmptyState
            state={newSearch({ query: 'въздушен филтър', mode })}
          />,
        )

        const href = hrefOf(/Търси по описание/)

        expect(href).toContain('q=въздушен+филтър')
        expect(href).toContain('mode=generic')
      },
    )

    // Changing lane re-runs the same search, so a scope the visitor applied to
    // it is not theirs to drop on the way.
    it('keeps the vehicle the search was scoped to', () => {
      render(
        <SearchEmptyState
          state={{
            ...newSearch({
              query: 'въздушен филтър',
              mode: SearchMode.PartNumber,
            }),
            vehicleId: '20154',
          }}
        />,
      )

      expect(hrefOf(/Търси по описание/)).toContain('vehicleId=20154')
    })

    // Already the widest lane there is, so the retry would land back on the
    // page the visitor is looking at.
    it('is withheld when the search was already descriptive', () => {
      render(
        <SearchEmptyState
          state={newSearch({
            query: 'въздушен филтър',
            mode: SearchMode.Generic,
          })}
        />,
      )

      expect(
        screen.queryByRole('link', { name: /Търси по описание/ }),
      ).not.toBeInTheDocument()
    })

    it('is withheld when nothing was searched for yet', () => {
      render(<SearchEmptyState state={numberSearch('')} />)

      expect(
        screen.queryByRole('link', { name: /Търси по описание/ }),
      ).not.toBeInTheDocument()
    })
  })

  describe('"did you mean" recovery', () => {
    const suggestions: AutocompleteItemDto[] = [
      {
        kind: 'article',
        articleNumber: 'XXXX900',
        brandId: '268',
        brandName: 'WIX',
        description: 'Oil Filter',
      },
      {
        kind: 'article',
        articleNumber: 'XXXX901',
        brandId: '268',
        brandName: 'WIX',
        description: 'Air Filter',
      },
    ]

    it('lists the suggested articles', () => {
      render(
        <SearchEmptyState
          state={numberSearch('XXXX999')}
          suggestions={suggestions}
        />,
      )

      expect(screen.getByText('Може би търсите:')).toBeInTheDocument()
      expect(screen.getByText('XXXX900')).toBeInTheDocument()
      expect(screen.getByText('XXXX901')).toBeInTheDocument()
    })

    // A number is unique only within a brand, so the link has to carry both.
    it('links each suggestion to its brand-scoped detail page', () => {
      render(
        <SearchEmptyState
          state={numberSearch('XXXX999')}
          suggestions={suggestions}
        />,
      )

      expect(hrefOf(/XXXX900/)).toBe('/catalog/articles/268/XXXX900')
    })

    it.each([
      ['absent', undefined],
      ['an empty array', []],
    ])('renders no recovery section when suggestions are %s', (_, given) => {
      render(
        <SearchEmptyState state={numberSearch('XXXX999')} suggestions={given} />,
      )

      expect(screen.queryByText('Може би търсите:')).not.toBeInTheDocument()
    })

    // Only the article kind can be linked to a detail page; the API's
    // zero-result recovery returns that kind, but the type permits others.
    it('ignores suggestion kinds it cannot link', () => {
      render(
        <SearchEmptyState
          state={numberSearch('XXXX999')}
          suggestions={[{ kind: 'term', term: 'маслен филтър' }]}
        />,
      )

      expect(screen.queryByText('Може би търсите:')).not.toBeInTheDocument()
    })
  })
})
