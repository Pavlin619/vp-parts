import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CartListActions } from './cart-list-actions'

describe('CartListActions', () => {
  it('offers the way back to the catalogue', () => {
    render(<CartListActions onClear={jest.fn()} />)

    expect(
      screen.getByRole('link', { name: /Продължи пазаруването/ }),
    ).toHaveAttribute('href', '/catalog')
  })

  // Emptying the cart cannot be undone and the lines are only in this browser,
  // so the first click asks rather than destroys.
  it('does not empty the cart on the first click', async () => {
    const user = userEvent.setup()
    const onClear = jest.fn()
    render(<CartListActions onClear={onClear} />)

    await user.click(screen.getByRole('button', { name: 'Изпразни кошницата' }))

    expect(onClear).not.toHaveBeenCalled()
    expect(screen.getByText('Да изпразня ли кошницата?')).toBeInTheDocument()
  })

  it('empties the cart once the ask is confirmed', async () => {
    const user = userEvent.setup()
    const onClear = jest.fn()
    render(<CartListActions onClear={onClear} />)

    await user.click(screen.getByRole('button', { name: 'Изпразни кошницата' }))
    await user.click(screen.getByRole('button', { name: 'Да, изпразни' }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('backs out of the ask without touching the cart', async () => {
    const user = userEvent.setup()
    const onClear = jest.fn()
    render(<CartListActions onClear={onClear} />)

    await user.click(screen.getByRole('button', { name: 'Изпразни кошницата' }))
    await user.click(screen.getByRole('button', { name: 'Отказ' }))

    expect(onClear).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Изпразни кошницата' }),
    ).toBeInTheDocument()
  })
})
