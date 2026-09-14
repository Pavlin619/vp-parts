import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CartListHeader } from './cart-list-header'

function renderHeader(props: Partial<Parameters<typeof CartListHeader>[0]> = {}) {
  return render(
    <CartListHeader
      areAllSelected={props.areAllSelected ?? true}
      areSomeSelected={props.areSomeSelected ?? true}
      onToggleAll={props.onToggleAll ?? jest.fn()}
    />,
  )
}

describe('CartListHeader', () => {
  it('names the columns once, above the list', () => {
    renderHeader()

    expect(screen.getByText('Артикул')).toBeInTheDocument()
    expect(screen.getByText('Доставка')).toBeInTheDocument()
    expect(screen.getByText('Количество')).toBeInTheDocument()
    expect(screen.getByText('Общо с ДДС')).toBeInTheDocument()
  })

  it('deselects everything when the select-all is cleared', async () => {
    const user = userEvent.setup()
    const onToggleAll = jest.fn()

    renderHeader({ onToggleAll })

    await user.click(
      screen.getByRole('checkbox', { name: 'Избери всички артикули' }),
    )

    expect(onToggleAll).toHaveBeenCalledWith(false)
  })

  it('selects everything when nothing is selected', async () => {
    const user = userEvent.setup()
    const onToggleAll = jest.fn()

    renderHeader({ areAllSelected: false, areSomeSelected: false, onToggleAll })

    await user.click(
      screen.getByRole('checkbox', { name: 'Избери всички артикули' }),
    )

    expect(onToggleAll).toHaveBeenCalledWith(true)
  })

  it('shows a partial selection as partial', () => {
    renderHeader({ areAllSelected: false, areSomeSelected: true })

    expect(screen.getByRole('checkbox')).toBePartiallyChecked()
  })
})
