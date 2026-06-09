import { render, screen } from '@testing-library/react'
import { CatalogPagination } from './catalog-pagination'

const defaults = { vehicleId: 'v-1', pageSize: 20 }

describe('CatalogPagination — hidden when not needed', () => {
  it('renders nothing when total fits on one page', () => {
    const { container } = render(
      <CatalogPagination page={1} total={20} {...defaults} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('CatalogPagination — first page', () => {
  it('hides the previous link on page 1', () => {
    render(<CatalogPagination page={1} total={100} {...defaults} />)
    expect(screen.queryByText('← Предишна')).not.toBeInTheDocument()
  })

  it('shows the next link on page 1', () => {
    render(<CatalogPagination page={1} total={100} {...defaults} />)
    expect(screen.getByText('Следваща →')).toBeInTheDocument()
  })
})

describe('CatalogPagination — last page', () => {
  it('shows the previous link on the last page', () => {
    render(<CatalogPagination page={5} total={100} {...defaults} />)
    expect(screen.getByText('← Предишна')).toBeInTheDocument()
  })

  it('hides the next link on the last page', () => {
    render(<CatalogPagination page={5} total={100} {...defaults} />)
    expect(screen.queryByText('Следваща →')).not.toBeInTheDocument()
  })
})

describe('CatalogPagination — middle page', () => {
  it('shows both previous and next links', () => {
    render(<CatalogPagination page={3} total={100} {...defaults} />)
    expect(screen.getByText('← Предишна')).toBeInTheDocument()
    expect(screen.getByText('Следваща →')).toBeInTheDocument()
  })

  it('shows the correct page indicator', () => {
    render(<CatalogPagination page={3} total={100} {...defaults} />)
    expect(screen.getByText('Страница 3 от 5')).toBeInTheDocument()
  })
})

describe('CatalogPagination — link hrefs', () => {
  it('links to the correct previous page with vehicleId', () => {
    render(<CatalogPagination page={3} total={100} {...defaults} />)
    expect(screen.getByText('← Предишна').closest('a')).toHaveAttribute(
      'href',
      '?vehicleId=v-1&page=2&pageSize=20',
    )
  })

  it('links to the correct next page with vehicleId', () => {
    render(<CatalogPagination page={3} total={100} {...defaults} />)
    expect(screen.getByText('Следваща →').closest('a')).toHaveAttribute(
      'href',
      '?vehicleId=v-1&page=4&pageSize=20',
    )
  })
})
