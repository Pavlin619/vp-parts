import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CartListActions } from './cart-list-actions'

describe('CartListActions', () => {
  it('offers the way back to the catalogue', () => {
    render(<CartListActions onClear={jest.fn()} itemCount={1} />)

    expect(
      screen.getByRole('link', { name: /Продължи пазаруването/ }),
    ).toHaveAttribute('href', '/catalog')
  })

  // Emptying the cart cannot be undone and the lines are only in this browser,
  // so the first click asks rather than destroys.
  it('does not empty the cart on the first click', async () => {
    const user = userEvent.setup()
    const onClear = jest.fn()
    render(<CartListActions onClear={onClear} itemCount={1} />)

    await user.click(screen.getByRole('button', { name: 'Изпразни кошницата' }))

    expect(onClear).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog', {
      name: 'Изпразване на кошницата',
    })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveTextContent(
      'Сигурни ли сте, че искате да премахнете всичките 1 артикул от кошницата ви?',
    )
  })

  it('uses the plural noun form for more than one item', async () => {
    const user = userEvent.setup()
    render(<CartListActions onClear={jest.fn()} itemCount={3} />)

    await user.click(screen.getByRole('button', { name: 'Изпразни кошницата' }))

    expect(
      screen.getByRole('alertdialog', { name: 'Изпразване на кошницата' }),
    ).toHaveTextContent(
      'Сигурни ли сте, че искате да премахнете всичките 3 артикула от кошницата ви?',
    )
  })

  it('empties the cart once the ask is confirmed', async () => {
    const user = userEvent.setup()
    const onClear = jest.fn()
    render(<CartListActions onClear={onClear} itemCount={1} />)

    await user.click(screen.getByRole('button', { name: 'Изпразни кошницата' }))
    await user.click(screen.getByRole('button', { name: 'Изпразни' }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('backs out of the ask without touching the cart', async () => {
    const user = userEvent.setup()
    const onClear = jest.fn()
    render(<CartListActions onClear={onClear} itemCount={1} />)

    await user.click(screen.getByRole('button', { name: 'Изпразни кошницата' }))
    await user.click(screen.getByRole('button', { name: 'Отказ' }))

    expect(onClear).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Изпразни кошницата' }),
    ).toBeInTheDocument()
  })
})
