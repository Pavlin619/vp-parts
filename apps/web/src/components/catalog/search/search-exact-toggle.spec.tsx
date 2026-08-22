import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchExactToggle } from './search-exact-toggle'

describe('SearchExactToggle', () => {
  it('exposes its state as a switch', () => {
    render(<SearchExactToggle isExact onChange={jest.fn()} />)

    expect(screen.getByRole('switch', { name: 'Точно съвпадение' })).toBeChecked()
  })

  it('reports the flipped value', async () => {
    const onChange = jest.fn()
    const user = userEvent.setup()
    render(<SearchExactToggle isExact={false} onChange={onChange} />)

    await user.click(screen.getByRole('switch'))

    expect(onChange).toHaveBeenCalledWith(true)
  })
})
