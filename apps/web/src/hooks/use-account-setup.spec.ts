import { renderHook, act } from '@testing-library/react'
import { useAuth } from '@clerk/nextjs'
import { useAccountSetupStore, useAccountSetup } from './use-account-setup'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))

function signedIn(userId: string | null) {
  jest.mocked(useAuth).mockReturnValue({ userId } as ReturnType<typeof useAuth>)
}

beforeEach(() => {
  useAccountSetupStore.setState({ failedUserId: null })
  signedIn('user_1')
})

describe('useAccountSetup', () => {
  it('is in order until the session sync reports otherwise', () => {
    const { result } = renderHook(() => useAccountSetup())

    expect(result.current).toBe('ok')
  })

  it('reports an account the sync could not file for the signed-in user', () => {
    const { result } = renderHook(() => useAccountSetup())

    act(() => useAccountSetupStore.getState().reportFailed('user_1'))

    expect(result.current).toBe('failed')
  })

  // A failure belongs to the account it was found on, not to whoever signs in next.
  it('ignores a failure reported for another user', () => {
    useAccountSetupStore.getState().reportFailed('user_1')
    signedIn('user_2')

    const { result } = renderHook(() => useAccountSetup())

    expect(result.current).toBe('ok')
  })
})
