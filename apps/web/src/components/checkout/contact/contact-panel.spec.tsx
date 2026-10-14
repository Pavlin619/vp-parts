import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuth, useClerk } from '@clerk/nextjs'
import { ContactPanel } from './contact-panel'

jest.mock('@clerk/nextjs', () => ({
  useAuth: jest.fn(),
  useClerk: jest.fn(),
  SignIn: (props: {
    routing: string
    forceRedirectUrl: string
    signUpForceRedirectUrl: string
  }) => (
    <div
      data-testid="clerk-sign-in"
      data-routing={props.routing}
      data-redirect={props.forceRedirectUrl}
      data-sign-up-redirect={props.signUpForceRedirectUrl}
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

const signOut = jest.fn()

beforeEach(() => {
  signOut.mockReset()
  jest.mocked(useClerk).mockReturnValue({ signOut } as unknown as ReturnType<typeof useClerk>)
  mockSession({ isLoaded: true, isSignedIn: false })
})

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

  it('preselects nothing and asks for nothing until a mode is picked', () => {
    render(<ContactPanel mode={null} onModeChange={jest.fn()} />)

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked()
    }
    expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Регистрация' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Име и фамилия')).not.toBeInTheDocument()
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

  // Clerk turns a first Google sign-in into a sign-up, which
  // follows its own redirect and would otherwise land on the homepage.
  it('brings a new account made from the sign-in back to checkout too', () => {
    render(<ContactPanel mode="login" onModeChange={jest.fn()} />)

    expect(screen.getByTestId('clerk-sign-in')).toHaveAttribute(
      'data-sign-up-redirect',
      '/checkout',
    )
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

  // A Google sign-in's profile completion lives here, so it must not wait on a mode.
  it('shows the signed-in customer when no mode was picked', () => {
    mockSession({ isLoaded: true, isSignedIn: true })
    render(<ContactPanel mode={null} onModeChange={jest.fn()} />)

    expect(screen.getByTestId('signed-in-contact')).toBeInTheDocument()
  })

  // Signed out, the panel offers a quick order, so the cart can still be ordered.
  it('signs out a signed-in customer, keeping them at checkout', async () => {
    mockSession({ isLoaded: true, isSignedIn: true })
    render(<ContactPanel mode="quick" onModeChange={jest.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Изход' }))

    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/checkout' })
  })

  it('offers no sign-out to a guest', () => {
    render(<ContactPanel mode="quick" onModeChange={jest.fn()} />)

    expect(screen.queryByRole('button', { name: 'Изход' })).not.toBeInTheDocument()
  })

  it('waits for Clerk before choosing what to show', () => {
    mockSession({ isLoaded: false })
    render(<ContactPanel mode="quick" onModeChange={jest.fn()} />)

    expect(screen.getByTestId('contact-panel-skeleton')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByTestId('signed-in-contact')).not.toBeInTheDocument()
  })
})
