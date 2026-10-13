import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { CustomerRole, type CustomerProfileDto } from '@vp-parts-shop/shared'
import { ApiError } from '@/lib/api'
import { updateCustomerProfile } from '@/lib/api/customers'
import { useCompleteProfile } from './use-complete-profile'

jest.mock('@/lib/api/customers', () => ({
  ...jest.requireActual('@/lib/api/customers'),
  updateCustomerProfile: jest.fn(),
}))

const COMPLETE: CustomerProfileDto = {
  id: 'customer-1',
  email: 'ivan@gmail.com',
  firstName: 'Иван',
  lastName: 'Петров',
  phoneNumber: '+359888123456',
  role: CustomerRole.CUSTOMER,
  createdAt: '2026-10-11T10:00:00.000Z',
}

/** A Google account with no last name, as filed on first sign-in. */
const GOOGLE: CustomerProfileDto = { ...COMPLETE, lastName: null, phoneNumber: null }

const mockedUpdate = jest.mocked(updateCustomerProfile)

function renderCompleteProfile(profile = GOOGLE) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useCompleteProfile(profile), { wrapper })

  return { result, queryClient }
}

type Result = ReturnType<typeof renderCompleteProfile>['result']

function fill(result: Result, values: { lastName?: string; phoneNumber?: string }) {
  for (const [detail, value] of Object.entries(values)) {
    act(() => result.current.fieldProps(detail as 'lastName' | 'phoneNumber').onValueChange(value))
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedUpdate.mockResolvedValue(COMPLETE)
})

describe('useCompleteProfile', () => {
  it('asks only for what the profile is missing', () => {
    const { result } = renderCompleteProfile()

    expect(result.current.missing).toEqual(['lastName', 'phoneNumber'])
  })

  it('names nothing wrong before the customer has touched a field', () => {
    const { result } = renderCompleteProfile()

    expect(result.current.fieldProps('phoneNumber').error).toBeUndefined()
  })

  it('names a field that is not valid once the customer leaves it', () => {
    const { result } = renderCompleteProfile()

    fill(result, { phoneNumber: '02 987 6543' })
    act(() => result.current.fieldProps('phoneNumber').onBlur())

    expect(result.current.fieldProps('phoneNumber').error).toBe('Въведете валиден мобилен номер')
    expect(result.current.fieldProps('lastName').error).toBeUndefined()
  })

  it('refuses missing details left blank or invalid before the API is asked', async () => {
    const { result } = renderCompleteProfile()

    fill(result, { phoneNumber: '02 987 6543' })
    await act(() => result.current.submit())

    expect(result.current.fieldProps('lastName').error).toBe('Въведете фамилия (без цифри)')
    expect(result.current.fieldProps('phoneNumber').error).toBe('Въведете валиден мобилен номер')
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  // What the profile already holds is not the panel's to change.
  it('saves only the missing details, trimmed and normalised', async () => {
    const { result } = renderCompleteProfile()

    fill(result, { lastName: ' Петров ', phoneNumber: '0888 123 456' })
    await act(() => result.current.submit())

    expect(mockedUpdate).toHaveBeenCalledWith({
      lastName: 'Петров',
      phoneNumber: '+359888123456',
    })
  })

  it('hands the saved profile to everything reading it', async () => {
    const { result, queryClient } = renderCompleteProfile()

    fill(result, { lastName: 'Петров', phoneNumber: '0888123456' })
    await act(() => result.current.submit())

    expect(queryClient.getQueryData(['customers', 'me'])).toEqual(COMPLETE)
    expect(result.current.failure).toBeNull()
  })

  it('lets the customer try again when saving fails', async () => {
    mockedUpdate.mockRejectedValueOnce(new ApiError(503, 'INTERNAL_ERROR'))
    const { result, queryClient } = renderCompleteProfile()

    fill(result, { lastName: 'Петров', phoneNumber: '0888123456' })
    await act(() => result.current.submit())

    expect(result.current.failure).toBe('Не успяхме да запазим данните. Опитайте отново.')
    expect(queryClient.getQueryData(['customers', 'me'])).toBeUndefined()

    await act(() => result.current.submit())

    expect(result.current.failure).toBeNull()
    expect(queryClient.getQueryData(['customers', 'me'])).toEqual(COMPLETE)
  })

  it('clears a failure once the customer edits a field', async () => {
    mockedUpdate.mockRejectedValueOnce(new ApiError(503, 'INTERNAL_ERROR'))
    const { result } = renderCompleteProfile()
    fill(result, { lastName: 'Петров', phoneNumber: '0888123456' })
    await act(() => result.current.submit())

    fill(result, { phoneNumber: '0888123457' })

    expect(result.current.failure).toBeNull()
  })
})
