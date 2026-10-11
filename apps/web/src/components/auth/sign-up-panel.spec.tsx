import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { SignUpPanel } from './sign-up-panel'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
jest.mock('./registration-form', () => ({
  RegistrationForm: ({
    onComplete,
    onSignUpStart,
  }: {
    onComplete: () => void
    onSignUpStart: () => void
  }) => (
    <>
      <button type="button" onClick={onSignUpStart}>
        започни
      </button>
      <button type="button" onClick={onComplete}>
        завърши
      </button>
    </>
  ),
}))

function signedIn(isSignedIn: boolean) {
  return { isLoaded: true, isSignedIn } as ReturnType<typeof useAuth>
}

const replace = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useRouter).mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>)
  jest.mocked(useAuth).mockReturnValue(signedIn(false))
})

describe('SignUpPanel', () => {
  it('goes back where the visitor came from once registered', async () => {
    render(<SignUpPanel redirectUrl={`${window.location.origin}/checkout`} />)

    await userEvent.click(screen.getByRole('button', { name: 'завърши' }))

    expect(replace).toHaveBeenCalledWith('/checkout')
  })

  it('goes home for a redirect off the site', async () => {
    render(<SignUpPanel redirectUrl="https://evil.example/phish" />)

    await userEvent.click(screen.getByRole('button', { name: 'завърши' }))

    expect(replace).toHaveBeenCalledWith('/')
  })

  it('sends someone already signed in on without the form', () => {
    jest.mocked(useAuth).mockReturnValue(signedIn(true))

    render(<SignUpPanel redirectUrl="/cart" />)

    expect(replace).toHaveBeenCalledWith('/cart')
    expect(screen.queryByRole('button', { name: 'завърши' })).not.toBeInTheDocument()
  })

  // The session goes live mid-submit; the form still has the customer to file.
  it('keeps the form until the sign-up it started completes', async () => {
    const { rerender } = render(<SignUpPanel redirectUrl="/cart" />)

    await userEvent.click(screen.getByRole('button', { name: 'започни' }))
    jest.mocked(useAuth).mockReturnValue(signedIn(true))
    rerender(<SignUpPanel redirectUrl="/cart" />)

    expect(replace).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'завърши' }))

    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/cart')
  })
})
