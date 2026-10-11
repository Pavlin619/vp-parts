import { render } from '@testing-library/react'
import { useAuth } from '@clerk/nextjs'
import { registerSession } from '@/lib/api/session-token'
import { SessionTokenBridge } from './session-token-bridge'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))
jest.mock('@/lib/api/session-token')

const mockedUseAuth = useAuth as jest.Mock
const mockedRegisterSession = jest.mocked(registerSession)

beforeEach(() => {
  jest.clearAllMocks()
})

describe('SessionTokenBridge', () => {
  // Registered too early, a signed-in customer would read as a guest.
  it('registers nothing while Clerk is loading', () => {
    mockedUseAuth.mockReturnValue({ isLoaded: false, isSignedIn: undefined, getToken: jest.fn() })

    render(<SessionTokenBridge />)

    expect(mockedRegisterSession).not.toHaveBeenCalled()
  })

  it('registers a signed-in session that reads Clerk’s token', async () => {
    const getToken = jest.fn().mockResolvedValue('session-jwt')
    mockedUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true, getToken })

    render(<SessionTokenBridge />)

    const session = mockedRegisterSession.mock.calls[0][0]
    expect(session.isSignedIn).toBe(true)
    await expect(session.getToken()).resolves.toBe('session-jwt')
  })

  it('registers a signed-out session once Clerk has loaded', () => {
    mockedUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false, getToken: jest.fn() })

    render(<SessionTokenBridge />)

    expect(mockedRegisterSession).toHaveBeenCalledWith(
      expect.objectContaining({ isSignedIn: false }),
    )
  })

  it('renders nothing', () => {
    mockedUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false, getToken: jest.fn() })

    const { container } = render(<SessionTokenBridge />)

    expect(container).toBeEmptyDOMElement()
  })
})
