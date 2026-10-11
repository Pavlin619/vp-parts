import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useClerk } from '@clerk/nextjs'
import {
  AppErrorCode,
  CustomerRole,
  type CustomerProfileDto,
} from '@vp-parts-shop/shared'
import { ApiError } from '@/lib/api'
import { getCustomerProfile } from '@/lib/api/customers'
import { SignedInContact } from './signed-in-contact'

jest.mock('@clerk/nextjs', () => ({ useClerk: jest.fn() }))

jest.mock('@/lib/api/customers', () => {
  const actual = jest.requireActual('@/lib/api/customers')
  const getCustomerProfile = jest.fn()

  return {
    ...actual,
    getCustomerProfile,
    customerProfileQueryOptions: {
      ...actual.customerProfileQueryOptions,
      queryFn: () => getCustomerProfile(),
    },
  }
})

const mockedGetProfile = jest.mocked(getCustomerProfile)
const signOut = jest.fn()

const PROFILE: CustomerProfileDto = {
  id: 'customer-1',
  email: 'ivan@example.bg',
  firstName: 'Иван',
  lastName: 'Петров',
  phoneNumber: '+359888123456',
  role: CustomerRole.CUSTOMER,
  createdAt: '2026-10-01T10:00:00.000Z',
}

function renderContact() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <SignedInContact />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockedGetProfile.mockReset()
  signOut.mockReset()
  jest.mocked(useClerk).mockReturnValue({ signOut } as unknown as ReturnType<typeof useClerk>)
})

describe('SignedInContact', () => {
  it('shows a skeleton while the profile loads', () => {
    mockedGetProfile.mockReturnValue(new Promise(() => {}))
    renderContact()

    expect(screen.getByTestId('signed-in-contact-skeleton')).toBeInTheDocument()
  })

  it('shows who the order is for', async () => {
    mockedGetProfile.mockResolvedValue(PROFILE)
    renderContact()

    expect(await screen.findByText('Иван Петров')).toBeInTheDocument()
    expect(screen.getByText('ivan@example.bg')).toBeInTheDocument()
    expect(screen.getByText('+359888123456')).toBeInTheDocument()
  })

  it('names each line for a screen reader', async () => {
    mockedGetProfile.mockResolvedValue(PROFILE)
    renderContact()

    await screen.findByText('Иван Петров')

    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Име',
      'Имейл',
      'Телефон',
    ])
  })

  it('keeps the skeleton while the session sync files a new customer', async () => {
    mockedGetProfile.mockRejectedValue(
      new ApiError(404, AppErrorCode.CUSTOMER_PROFILE_INCOMPLETE),
    )
    renderContact()

    await screen.findByTestId('signed-in-contact-skeleton')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('offers a retry when the profile cannot be read', async () => {
    mockedGetProfile.mockRejectedValueOnce(new ApiError(503, 'UNKNOWN_ERROR'))
    renderContact()

    await screen.findByRole('alert')
    mockedGetProfile.mockResolvedValue(PROFILE)
    await userEvent.click(screen.getByRole('button', { name: 'Опитай отново' }))

    expect(await screen.findByText('Иван Петров')).toBeInTheDocument()
  })

  it('signs out a customer who is not who the card names, keeping them at checkout', async () => {
    mockedGetProfile.mockResolvedValue(PROFILE)
    renderContact()

    await userEvent.click(await screen.findByRole('button', { name: 'Изход' }))

    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/checkout' })
  })
})
