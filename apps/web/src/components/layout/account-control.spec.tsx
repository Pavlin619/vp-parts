import { render, screen } from '@testing-library/react'
import { useAuth } from '@clerk/nextjs'
import { AccountControl } from './account-control'

jest.mock('@clerk/nextjs', () => ({
  useAuth: jest.fn(),
  UserButton: () => <div data-testid="user-button" />,
}))

const mockedUseAuth = useAuth as jest.Mock

describe('AccountControl', () => {
  it('leads a signed-out visitor to sign in', () => {
    mockedUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false })

    render(<AccountControl />)

    expect(screen.getByRole('link', { name: 'Вход' })).toHaveAttribute('href', '/sign-in')
    expect(screen.queryByTestId('user-button')).not.toBeInTheDocument()
  })

  it('shows the account menu to a signed-in customer', () => {
    mockedUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true })

    render(<AccountControl />)

    expect(screen.getByTestId('user-button')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Вход' })).not.toBeInTheDocument()
  })

  it('keeps the sign-in link while Clerk is still loading', () => {
    mockedUseAuth.mockReturnValue({ isLoaded: false, isSignedIn: undefined })

    render(<AccountControl />)

    expect(screen.getByRole('link', { name: 'Вход' })).toBeInTheDocument()
  })
})
