import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchSort } from '@vp-parts-shop/shared'
import { SubstitutesSortToggle } from './substitutes-sort-toggle'

describe('SubstitutesSortToggle', () => {
  it('offers the two axes a visitor compares alternatives on', () => {
    render(
      <SubstitutesSortToggle
        sort={SearchSort.Availability}
        onSortChange={jest.fn()}
      />,
    )

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(
      ['Цена', 'Наличност'],
    )
  })

  it('marks the applied order as pressed', () => {
    render(
      <SubstitutesSortToggle
        sort={SearchSort.Availability}
        onSortChange={jest.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Наличност' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Цена' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  // Cheapest first, not dearest: the visitor reaching for a price order on a
  // list of alternatives is looking for the cheaper one.
  it('asks for the cheapest first when price is chosen', async () => {
    const user = userEvent.setup()
    const onSortChange = jest.fn()
    render(
      <SubstitutesSortToggle
        sort={SearchSort.Availability}
        onSortChange={onSortChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Цена' }))

    expect(onSortChange).toHaveBeenCalledWith(SearchSort.PriceAscending)
  })

  it('does not re-ask for the order already applied', async () => {
    const user = userEvent.setup()
    const onSortChange = jest.fn()
    render(
      <SubstitutesSortToggle
        sort={SearchSort.Availability}
        onSortChange={onSortChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Наличност' }))

    expect(onSortChange).not.toHaveBeenCalled()
  })
})
