import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { useUser } from '@clerk/nextjs'
import { ClerkAPIResponseError } from '@clerk/nextjs/errors'
import { CustomerRole, type CustomerProfileDto } from '@vp-parts-shop/shared'
import { ApiError } from '@/lib/api'
import { fileCustomer } from '@/lib/api/customers'
import { useCompleteProfile } from './use-complete-profile'

jest.mock('@clerk/nextjs', () => ({ useUser: jest.fn() }))
jest.mock('@/lib/api/customers', () => ({
  ...jest.requireActual('@/lib/api/customers'),
  fileCustomer: jest.fn(),
}))

const PROFILE: CustomerProfileDto = {
  id: 'customer-1',
  email: 'ivan@gmail.com',
  firstName: 'Иван',
  lastName: 'Петров',
  phoneNumber: '+359888123456',
  role: CustomerRole.CUSTOMER,
  createdAt: '2026-10-11T10:00:00.000Z',
}

const updateMetadata = jest.fn()
const mockedFileCustomer = jest.mocked(fileCustomer)

function renderCompleteProfile(onComplete = jest.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useCompleteProfile(onComplete), { wrapper })

  return { result, onComplete, queryClient }
}

async function submitPhone(
  result: ReturnType<typeof renderCompleteProfile>['result'],
  phone: string,
) {
  act(() => result.current.changePhoneNumber(phone))
  await act(() => result.current.submit())
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useUser).mockReturnValue({
    user: { updateMetadata },
  } as unknown as ReturnType<typeof useUser>)
  updateMetadata.mockResolvedValue({})
  mockedFileCustomer.mockResolvedValue(PROFILE)
})

describe('useCompleteProfile', () => {
  it('names nothing wrong before the customer has touched the field', () => {
    const { result } = renderCompleteProfile()

    expect(result.current.phoneError).toBeUndefined()
  })

  it('names a phone that is not valid once the customer leaves the field', () => {
    const { result } = renderCompleteProfile()

    act(() => result.current.changePhoneNumber('02 987 6543'))
    act(() => result.current.markTouched())

    expect(result.current.phoneError).toBe('Въведете валиден мобилен номер')
  })

  it.each([
    ['nothing', ''],
    ['a landline', '02 987 6543'],
  ])('refuses %s before Clerk is asked', async (_case, phone) => {
    const { result, onComplete } = renderCompleteProfile()

    await submitPhone(result, phone)

    expect(result.current.phoneError).toBe('Въведете валиден мобилен номер')
    expect(updateMetadata).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  // The API files the customer only from what Clerk holds, so the phone goes
  // there first, normalised exactly as it will be stored.
  it('stores the phone on the Clerk user, then files the customer', async () => {
    const order: string[] = []
    updateMetadata.mockImplementation(async () => {
      order.push('metadata')
    })
    mockedFileCustomer.mockImplementation(async () => {
      order.push('file')
      return PROFILE
    })
    const { result, onComplete, queryClient } = renderCompleteProfile()

    await submitPhone(result, '0888 123 456')

    expect(updateMetadata).toHaveBeenCalledWith({
      unsafeMetadata: { phoneNumber: '+359888123456' },
    })
    expect(order).toEqual(['metadata', 'file'])
    expect(queryClient.getQueryData(['customers', 'me'])).toEqual(PROFILE)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('reports Clerk’s refusal in Bulgarian and files nothing', async () => {
    updateMetadata.mockRejectedValue(
      new ClerkAPIResponseError('refused', {
        status: 429,
        data: [{ code: 'too_many_requests', message: 'too many' }],
      }),
    )
    const { result, onComplete } = renderCompleteProfile()

    await submitPhone(result, '0888123456')

    expect(result.current.failure).toBe('Твърде много опити. Опитайте отново след малко.')
    expect(mockedFileCustomer).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  // A sign-up message such as "registration failed" would be wrong under a phone field.
  it('reports any other Clerk failure as the phone not being saved', async () => {
    updateMetadata.mockRejectedValue(new Error('offline'))
    const { result, onComplete } = renderCompleteProfile()

    await submitPhone(result, '0888123456')

    expect(result.current.failure).toBe('Не успяхме да запазим телефона. Опитайте отново.')
    expect(mockedFileCustomer).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('lets the customer try again when filing fails on transport', async () => {
    mockedFileCustomer.mockRejectedValueOnce(new ApiError(503, 'INTERNAL_ERROR'))
    const { result, onComplete } = renderCompleteProfile()

    await submitPhone(result, '0888123456')

    expect(result.current.failure).toMatch(/Опитайте отново/)
    expect(onComplete).not.toHaveBeenCalled()

    await act(() => result.current.submit())

    expect(result.current.failure).toBeNull()
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  // The session sync then shows the notice for an account it can never file.
  it('hands an account that can never be filed back to the session sync', async () => {
    mockedFileCustomer.mockRejectedValue(new ApiError(409, 'EMAIL_ALREADY_EXISTS'))
    const { result, onComplete } = renderCompleteProfile()

    await submitPhone(result, '0888123456')

    expect(result.current.failure).toBeNull()
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('clears a failure once the customer edits the phone', async () => {
    mockedFileCustomer.mockRejectedValueOnce(new ApiError(503, 'INTERNAL_ERROR'))
    const { result } = renderCompleteProfile()
    await submitPhone(result, '0888123456')

    act(() => result.current.changePhoneNumber('0888123457'))

    expect(result.current.failure).toBeNull()
  })
})
