import { renderHook, act } from '@testing-library/react'
import { useAuth } from '@clerk/nextjs'
import { useAccountSetupStore, useAccountSetup } from './use-account-setup'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))

function signedIn(userId: string | null) {
  jest.mocked(useAuth).mockReturnValue({ userId } as ReturnType<typeof useAuth>)
}

beforeEach(() => {
  useAccountSetupStore.setState({ stall: null, attempt: 0 })
  signedIn('user_1')
})

describe('useAccountSetup', () => {
  it('is in order until the session sync reports otherwise', () => {
    const { result } = renderHook(() => useAccountSetup())

    expect(result.current.accountSetup).toBe('ok')
  })

  it('reports what the sync stalled on for the signed-in user', () => {
    const { result } = renderHook(() => useAccountSetup())

    act(() => useAccountSetupStore.getState().report('user_1', 'phone-required'))

    expect(result.current.accountSetup).toBe('phone-required')
  })

  // A stall belongs to the account it was found on, not to whoever signs in next.
  it('ignores a stall reported for another user', () => {
    useAccountSetupStore.getState().report('user_1', 'failed')
    signedIn('user_2')

    const { result } = renderHook(() => useAccountSetup())

    expect(result.current.accountSetup).toBe('ok')
  })

  it('clears the stall and asks the sync for another pass when resumed', () => {
    useAccountSetupStore.getState().report('user_1', 'phone-required')
    const { result } = renderHook(() => useAccountSetup())

    act(() => result.current.resume())

    expect(result.current.accountSetup).toBe('ok')
    expect(useAccountSetupStore.getState().attempt).toBe(1)
  })
})
