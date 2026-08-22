import { render, screen } from '@testing-library/react'
import { Breadcrumbs } from './breadcrumbs'

const TRAIL = [
  { key: 'home', label: 'Начало', href: '/' },
  { key: 'all', label: 'Всички категории', href: '/search?q=филтър' },
  { key: 'current', label: 'Въздушен филтър' },
]

describe('Breadcrumbs', () => {
  it('links every crumb that carries an href', () => {
    render(<Breadcrumbs items={TRAIL} />)

    expect(screen.getByRole('link', { name: 'Начало' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(
      screen.getByRole('link', { name: 'Всички категории' }),
    ).toHaveAttribute('href', '/search?q=филтър')
  })

  it('renders the crumb without an href as the current page', () => {
    render(<Breadcrumbs items={TRAIL} />)

    expect(
      screen.queryByRole('link', { name: 'Въздушен филтър' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Въздушен филтър')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('exposes the trail as a labelled navigation landmark', () => {
    render(<Breadcrumbs items={TRAIL} />)

    expect(
      screen.getByRole('navigation', { name: 'Навигационна пътека' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('renders nothing when there is no trail', () => {
    const { container } = render(<Breadcrumbs items={[]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
