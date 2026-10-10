import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContactPanel } from './contact-panel'

jest.mock('../delivery/address', () => ({
  AddressPicker: () => <div data-testid="address-picker" />,
}))

jest.mock('../delivery/offices', () => ({
  OfficePicker: () => <div data-testid="office-picker" />,
}))

describe('ContactPanel', () => {
  it('offers sign-in, registration and a quick order', () => {
    render(<ContactPanel mode="quick" onModeChange={jest.fn()} />)

    expect(
      screen.getByRole('radiogroup', { name: 'Данни за контакт' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /Вход/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Регистрация/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Бърза поръчка/ })).toBeChecked()
  })

  it('reports the mode the customer picks', async () => {
    const onModeChange = jest.fn()
    render(<ContactPanel mode="quick" onModeChange={onModeChange} />)

    await userEvent.click(screen.getByRole('radio', { name: /Вход/ }))

    expect(onModeChange).toHaveBeenCalledWith('login')
  })

  it('asks for a name and a phone on a quick order', () => {
    render(<ContactPanel mode="quick" onModeChange={jest.fn()} />)

    expect(screen.getByLabelText('Име и фамилия')).toBeInTheDocument()
    expect(screen.getByLabelText('Телефон')).toBeInTheDocument()
    expect(screen.getByText('Ще ви се обадим')).toBeInTheDocument()
  })

  it.each(['login', 'register'] as const)(
    'leaves the fields out when the customer chooses %s',
    (mode) => {
      render(<ContactPanel mode={mode} onModeChange={jest.fn()} />)

      expect(screen.queryByLabelText('Име и фамилия')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Телефон')).not.toBeInTheDocument()
    },
  )
})
