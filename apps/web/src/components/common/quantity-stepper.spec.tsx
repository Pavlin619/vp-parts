import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuantityStepper } from './quantity-stepper'

describe('QuantityStepper', () => {
  it('steps the value in both directions', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()

    render(<QuantityStepper value={2} max={9} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Увеличи количеството' }))
    expect(onChange).toHaveBeenCalledWith(3)

    await user.click(screen.getByRole('button', { name: 'Намали количеството' }))
    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  it('stops at the floor and the ceiling', () => {
    const { rerender } = render(
      <QuantityStepper value={1} max={4} onChange={jest.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Намали количеството' })).toBeDisabled()

    rerender(<QuantityStepper value={4} max={4} onChange={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Увеличи количеството' })).toBeDisabled()
  })

  // Several steppers share a cart, and "increase quantity" five times over
  // tells a screen reader user nothing about which line they are on.
  it('names the part when one is given', () => {
    render(
      <QuantityStepper value={1} max={4} onChange={jest.fn()} itemLabel="WL6340" />,
    )

    expect(
      screen.getByRole('button', { name: 'Увеличи количеството за WL6340' }),
    ).toBeInTheDocument()
  })
})
