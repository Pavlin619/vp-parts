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

  // A reset that leaves the results scoped to a car is a link to the same empty
  // page — the vehicle is the strongest narrowing of the ones on offer.
  it('drops the vehicle scope too', () => {
    render(<SearchNoMatches state={{ ...narrowed, vehicleId: '10042' }} />)

    expect(
      screen.getByRole('link', { name: /Изчисти всички филтри/ }),
    ).toHaveAttribute('href', expect.not.stringContaining('vehicleId'))
  })

  it('names the vehicle among the narrowings to drop when one is applied', () => {
    render(<SearchNoMatches state={{ ...narrowed, vehicleId: '10042' }} />)

    expect(screen.getByText(/премахнете автомобила/)).toBeInTheDocument()
  })
})
