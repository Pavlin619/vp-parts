import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuth } from '@clerk/nextjs'
import { ContactPanel } from './contact-panel'

jest.mock('@clerk/nextjs', () => ({
  useAuth: jest.fn(),
  SignIn: (props: { routing: string; forceRedirectUrl: string }) => (
    <div
      data-testid="clerk-sign-in"
      data-routing={props.routing}
      data-redirect={props.forceRedirectUrl}
    />
  ),
}))

jest.mock('@/components/auth/registration-form', () => ({
  RegistrationForm: () => <form aria-label="Регистрация" />,
}))

jest.mock('./signed-in-contact', () => ({
  SignedInContact: () => <div data-testid="signed-in-contact" />,
}))

jest.mock('../delivery/address', () => ({
  AddressPicker: () => <div data-testid="address-picker" />,
}))

jest.mock('../delivery/offices', () => ({
  OfficePicker: () => <div data-testid="office-picker" />,
}))

function mockSession(session: { isLoaded: boolean; isSignedIn?: boolean }) {
  jest.mocked(useAuth).mockReturnValue(session as ReturnType<typeof useAuth>)
}

beforeEach(() => mockSession({ isLoaded: true, isSignedIn: false }))

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

  it('signs in on the page, coming back to checkout', () => {
    render(<ContactPanel mode="login" onModeChange={jest.fn()} />)

    const signIn = screen.getByTestId('clerk-sign-in')
    expect(signIn).toHaveAttribute('data-routing', 'hash')
    expect(signIn).toHaveAttribute('data-redirect', '/checkout')
    expect(screen.queryByLabelText('Име и фамилия')).not.toBeInTheDocument()
  })

  it('registers with our own form', () => {
    render(<ContactPanel mode="register" onModeChange={jest.fn()} />)

    expect(screen.getByRole('form', { name: 'Регистрация' })).toBeInTheDocument()
    expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Име и фамилия')).not.toBeInTheDocument()
  })

  it('shows the signed-in customer instead of the choices', () => {
    mockSession({ isLoaded: true, isSignedIn: true })
    render(<ContactPanel mode="register" onModeChange={jest.fn()} />)

    expect(screen.getByTestId('signed-in-contact')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Регистрация' })).not.toBeInTheDocument()
  })

  it('waits for Clerk before choosing what to show', () => {
    mockSession({ isLoaded: false })
    render(<ContactPanel mode="quick" onModeChange={jest.fn()} />)

    expect(screen.getByTestId('contact-panel-skeleton')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByTestId('signed-in-contact')).not.toBeInTheDocument()
  })
})
