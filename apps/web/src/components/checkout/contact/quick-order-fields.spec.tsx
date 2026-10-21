import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useQuickOrder } from '@/hooks/use-quick-order'
import { QuickOrderFields } from './quick-order-fields'

jest.mock('./quick-order-bot-check', () => ({
  QuickOrderBotCheck: () => <div data-testid="quick-order-bot-check" />,
}))

beforeEach(() => useQuickOrder.getState().reset())

describe('QuickOrderFields', () => {
  it('asks for the names, a mobile, an optional email and the bot check', () => {
    render(<QuickOrderFields />)

    expect(screen.getByLabelText('Име')).toBeInTheDocument()
    expect(screen.getByLabelText('Фамилия')).toBeInTheDocument()
    expect(screen.getByLabelText('Телефон')).toBeInTheDocument()
    expect(screen.getByLabelText('Имейл (по избор)')).toBeInTheDocument()
    expect(screen.getByTestId('quick-order-bot-check')).toBeInTheDocument()
  })

  it('keeps what is typed where the order button reads it', async () => {
    render(<QuickOrderFields />)

    await userEvent.type(screen.getByLabelText('Име'), 'Мария')
    await userEvent.type(screen.getByLabelText('Телефон'), '0888 765 432')

    expect(useQuickOrder.getState().contact).toMatchObject({
      firstName: 'Мария',
      phoneNumber: '0888 765 432',
    })
  })

  it('shows what the guest typed before, on coming back to the tab', () => {
    useQuickOrder.getState().setContactField('lastName', 'Иванова')

    render(<QuickOrderFields />)

    expect(screen.getByLabelText('Фамилия')).toHaveValue('Иванова')
  })

  it('stays quiet until a field has been left', () => {
    render(<QuickOrderFields />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Въведете име (без цифри)')).not.toBeInTheDocument()
  })

  it('flags each field that is wrong once it is left', async () => {
    render(<QuickOrderFields />)

    await userEvent.click(screen.getByLabelText('Име'))
    await userEvent.type(screen.getByLabelText('Телефон'), '088')
    await userEvent.type(screen.getByLabelText('Имейл (по избор)'), 'maria@')
    await userEvent.tab()

    expect(screen.getByText('Въведете име (без цифри)')).toBeInTheDocument()
    expect(screen.getByText('Въведете валиден мобилен номер')).toBeInTheDocument()
    expect(screen.getByText('Въведете валиден имейл')).toBeInTheDocument()
    expect(screen.getByLabelText('Телефон')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Въведете фамилия (без цифри)')).not.toBeInTheDocument()
  })

  it('takes no email as an answer', async () => {
    render(<QuickOrderFields />)

    await userEvent.click(screen.getByLabelText('Имейл (по избор)'))
    await userEvent.tab()

    expect(screen.queryByText('Въведете валиден имейл')).not.toBeInTheDocument()
  })

  it('says the office calls to confirm, and that it is paid on delivery', () => {
    render(<QuickOrderFields />)

    expect(screen.getByText('Ще ви се обадим')).toBeInTheDocument()
    expect(screen.getByText(/Плащането е при доставка/)).toBeInTheDocument()
  })
})
