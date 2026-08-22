import { render, screen } from '@testing-library/react'
import { SearchMode } from '@vp-parts-shop/shared'
import { newSearch } from '@/lib/catalog/search-url'
import { SearchNoMatches } from './search-no-matches'

describe('SearchNoMatches', () => {
  const narrowed = {
    ...newSearch({ query: 'филтър', mode: SearchMode.Generic }),
    brandIds: ['268'],
    categoryPath: ['1052'],
  }

  it('blames the filters rather than the query', () => {
    render(<SearchNoMatches state={narrowed} />)

    expect(screen.getByText(/Няма артикули за избраните филтри/)).toBeInTheDocument()
  })

  // The way out is dropping a narrowing, not retyping, so the escape hatch has
  // to keep the query intact.
  it('offers a reset that keeps the query and mode', () => {
    render(<SearchNoMatches state={narrowed} />)

    const href = decodeURIComponent(
      screen.getByRole('link', { name: /Изчисти всички филтри/ }).getAttribute('href') ?? '',
    )

    expect(href).toContain('q=филтър')
    expect(href).toContain('mode=generic')
    expect(href).not.toContain('brand=')
    expect(href).not.toContain('cat=')
  })
})
