import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSignUp } from '@clerk/nextjs'
import { ClerkAPIResponseError } from '@clerk/nextjs/errors'
import { GoogleSignUpButton } from './google-sign-up-button'

jest.mock('@clerk/nextjs', () => ({ useSignUp: jest.fn() }))

const LABEL = 'Регистрация с Google'

const sso = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  sso.mockReturnValue(new Promise(() => {}))
  jest.mocked(useSignUp).mockReturnValue({ signUp: { sso } } as unknown as ReturnType<
    typeof useSignUp
  >)
})

describe('GoogleSignUpButton', () => {
  it('signs up with Google and comes back through the callback to where it started', async () => {
    render(<GoogleSignUpButton redirectUrl={`${window.location.origin}/checkout`} />)

    await userEvent.click(screen.getByRole('button', { name: LABEL }))

    expect(sso).toHaveBeenCalledWith({
      strategy: 'oauth_google',
      redirectUrl: '/checkout',
      redirectCallbackUrl: '/sign-up/sso-callback?redirect_url=%2Fcheckout',
    })
  })

  it('goes home for a redirect off the site', async () => {
    render(<GoogleSignUpButton redirectUrl="https://evil.example/phish" />)

    await userEvent.click(screen.getByRole('button', { name: LABEL }))

    expect(sso).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: '/',
        redirectCallbackUrl: '/sign-up/sso-callback?redirect_url=%2F',
      }),
    )
  })

  it('cannot be pressed twice while Google is opening', async () => {
    render(<GoogleSignUpButton redirectUrl="/cart" />)

    await userEvent.click(screen.getByRole('button', { name: LABEL }))

    expect(screen.getByRole('button', { name: LABEL })).toBeDisabled()
  })

  it('can be pressed again when the browser brings the page back from Google', async () => {
    render(<GoogleSignUpButton redirectUrl="/cart" />)

    await userEvent.click(screen.getByRole('button', { name: LABEL }))
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })

    expect(screen.getByRole('button', { name: LABEL })).toBeEnabled()
  })

  it('says why Clerk refused and lets the visitor try again', async () => {
    sso.mockResolvedValueOnce({
      error: new ClerkAPIResponseError('refused', {
        status: 429,
        data: [{ code: 'too_many_requests', message: 'too many' }],
      }),
    })
    render(<GoogleSignUpButton redirectUrl="/cart" />)

    await userEvent.click(screen.getByRole('button', { name: LABEL }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Твърде много опити. Опитайте отново след малко.',
    )
    expect(screen.getByRole('button', { name: LABEL })).toBeEnabled()
  })
})
