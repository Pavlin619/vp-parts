import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeliveryOfficeType } from '@vp-parts-shop/shared'
import { EMPTY_OFFICE_SEARCH, type OfficeSearch } from '@/lib/checkout/delivery/office-search'
import { OfficeFilters } from './office-filters'

function renderFilters(search: Partial<OfficeSearch> = {}) {
  const onSearchChange = jest.fn()
  const current = { ...EMPTY_OFFICE_SEARCH, ...search }

  render(<OfficeFilters search={current} onSearchChange={onSearchChange} />)
  return { onSearchChange, current }
}

describe('OfficeFilters', () => {
  it('shows which kind of pickup point is chosen', () => {
    renderFilters({ type: DeliveryOfficeType.LOCKER })

    expect(screen.getByRole('button', { name: 'Автомати' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Всички' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches the kind of pickup point', async () => {
    const user = userEvent.setup()
    const { onSearchChange, current } = renderFilters()

    await user.click(screen.getByRole('button', { name: 'Офиси' }))

    expect(onSearchChange).toHaveBeenCalledWith({ ...current, type: DeliveryOfficeType.OFFICE })
  })

  it('shows a chosen city and lets the customer drop it', async () => {
    const user = userEvent.setup()
    const { onSearchChange, current } = renderFilters({ city: 'Пловдив' })

    await user.click(screen.getByRole('button', { name: 'Премахни града Пловдив' }))

    expect(onSearchChange).toHaveBeenCalledWith({ ...current, city: null })
  })

  it('has no city chip without a city', () => {
    renderFilters()

    expect(screen.queryByRole('button', { name: /Премахни града/ })).not.toBeInTheDocument()
  })
})
