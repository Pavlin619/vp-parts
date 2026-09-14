import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Checkbox } from './checkbox'

describe('Checkbox', () => {
  it('reports the new state when toggled', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()

    render(<Checkbox checked={false} onChange={onChange} label="Избери WL6340" />)

    await user.click(screen.getByRole('checkbox', { name: 'Избери WL6340' }))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('reflects the checked state', () => {
    render(<Checkbox checked onChange={jest.fn()} label="Избери WL6340" />)

    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  // A select-all over a partial selection must not claim everything is checked.
  it('carries the indeterminate state onto the input', () => {
    render(
      <Checkbox
        checked={false}
        indeterminate
        onChange={jest.fn()}
        label="Избери всички"
      />,
    )

    expect(screen.getByRole('checkbox')).toBePartiallyChecked()
  })

  it('drops the indeterminate state when it is no longer partial', () => {
    const { rerender } = render(
      <Checkbox checked={false} indeterminate onChange={jest.fn()} label="Избери всички" />,
    )
    rerender(
      <Checkbox checked onChange={jest.fn()} label="Избери всички" />,
    )

    expect(screen.getByRole('checkbox')).not.toBePartiallyChecked()
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})
