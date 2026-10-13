import { act, render, screen } from '@testing-library/react'
import { HandleSSOCallback } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { SignUpSsoCallback } from './sign-up-sso-callback'

jest.mock('@clerk/nextjs', () => ({ HandleSSOCallback: jest.fn(() => null) }))
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

type CallbackProps = Parameters<typeof HandleSSOCallback>[0]
type NavigateParams = Parameters<CallbackProps['navigateToApp']>[0]

const replace = jest.fn()

function renderCallback(redirectUrl?: string): CallbackProps {
  render(<SignUpSsoCallback redirectUrl={redirectUrl} />)

  return jest.mocked(HandleSSOCallback).mock.calls[0][0]
}

function sessionParams(decorateUrl = (url: string) => url): NavigateParams {
  return { session: {}, decorateUrl } as unknown as NavigateParams
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useRouter).mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>)
})

describe('SignUpSsoCallback', () => {
  it('goes back where the sign-up started once the session is live', () => {
    const { navigateToApp } = renderCallback('/checkout')

    navigateToApp(sessionParams())

    expect(replace).toHaveBeenCalledWith('/checkout')
  })

  it('goes home for a redirect off the site', () => {
    const { navigateToApp } = renderCallback('https://evil.example/phish')

    navigateToApp(sessionParams())

    expect(replace).toHaveBeenCalledWith('/')
  })

  it('navigates through the URL Clerk decorates', () => {
    const { navigateToApp } = renderCallback('/checkout')

    navigateToApp(sessionParams((url) => `${url}?__clerk_refresh=1`))

    expect(replace).toHaveBeenCalledWith('/checkout?__clerk_refresh=1')
  })

  it('sends an account that needs more verification to sign in, keeping the target', () => {
    const { navigateToSignIn } = renderCallback('/checkout')

    navigateToSignIn()

    expect(replace).toHaveBeenCalledWith('/sign-in?redirect_url=%2Fcheckout')
  })

  it('sends a sign-up that needs more back to registration, keeping the target', () => {
    const { navigateToSignUp } = renderCallback('/checkout')

    navigateToSignUp()

    expect(replace).toHaveBeenCalledWith('/sign-up?redirect_url=%2Fcheckout')
  })

  describe('when Clerk never moves on, as after cancelling at Google', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('offers no way out while the flow is still finishing', () => {
      renderCallback('/checkout')

      act(() => jest.advanceTimersByTime(1000))

      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('offers a way back to registration, keeping the target', () => {
      renderCallback('/checkout')

      act(() => jest.runOnlyPendingTimers())

      expect(screen.getByRole('link', { name: 'Обратно към регистрацията' })).toHaveAttribute(
        'href',
        '/sign-up?redirect_url=%2Fcheckout',
      )
    })
  })
})
