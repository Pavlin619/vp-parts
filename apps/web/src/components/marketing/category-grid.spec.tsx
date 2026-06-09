import { render, screen } from '@testing-library/react'
import { CategoryGrid, CATEGORIES } from './category-grid'

describe('CategoryGrid', () => {
  it('renders a link for every category', () => {
    render(<CategoryGrid />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(CATEGORIES.length)
  })

  it('builds correct catalog hrefs from slugs', () => {
    render(<CategoryGrid />)
    CATEGORIES.forEach((cat) => {
      expect(screen.getByRole('link', { name: new RegExp(cat.name) })).toHaveAttribute(
        'href',
        `/catalog/${cat.slug}`,
      )
    })
  })

  it('displays all category names', () => {
    render(<CategoryGrid />)
    CATEGORIES.forEach((cat) => {
      expect(screen.getByText(cat.name)).toBeInTheDocument()
    })
  })
})
