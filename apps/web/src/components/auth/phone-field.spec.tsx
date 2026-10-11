import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhoneField } from './phone-field'

describe('PhoneField', () => {
  it('renders a telephone input under the default label', () => {
    render(<PhoneField value="" onValueChange={jest.fn()} />)

    const input = screen.getByLabelText('Телефон')
    expect(input).toHaveAttribute('type', 'tel')
    expect(input).toHaveAttribute('inputMode', 'tel')
    expect(input).toHaveAttribute('autoComplete', 'tel')
    expect(input).toHaveAttribute('placeholder', '+359 88 123 4567')
  })

  it('passes typed values and an error through', async () => {
    const onValueChange = jest.fn()
    render(<PhoneField value="" onValueChange={onValueChange} error="Грешка" />)

    await userEvent.type(screen.getByLabelText('Телефон'), '0')

    expect(onValueChange).toHaveBeenCalledWith('0')
    expect(screen.getByText('Грешка')).toBeInTheDocument()
    expect(screen.getByLabelText('Телефон')).toHaveAttribute('aria-invalid', 'true')
  })
})
