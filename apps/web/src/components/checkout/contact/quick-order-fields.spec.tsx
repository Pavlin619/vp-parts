import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuickOrderFields } from './quick-order-fields'

describe('QuickOrderFields', () => {
  it('stays quiet until a field has been left', () => {
    render(<QuickOrderFields />)

    expect(screen.queryByText('Въведете име и фамилия')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Въведете валиден телефонен номер'),
    ).not.toBeInTheDocument()
  })

  it('flags a missing name and a short phone once left', async () => {
    render(<QuickOrderFields />)

    await userEvent.click(screen.getByLabelText('Име и фамилия'))
    await userEvent.type(screen.getByLabelText('Телефон'), '088')
    await userEvent.tab()

    expect(screen.getByText('Въведете име и фамилия')).toBeInTheDocument()
    expect(screen.getByText('Въведете валиден телефонен номер')).toBeInTheDocument()
    expect(screen.getByLabelText('Телефон')).toHaveAttribute('aria-invalid', 'true')
  })

  it('clears the errors once the details are valid', async () => {
    render(<QuickOrderFields />)

    await userEvent.type(screen.getByLabelText('Име и фамилия'), 'Иван Петров')
    await userEvent.type(screen.getByLabelText('Телефон'), '+359 88 123 4567')
    await userEvent.tab()

    expect(screen.queryByText('Въведете име и фамилия')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Въведете валиден телефонен номер'),
    ).not.toBeInTheDocument()
  })
})
