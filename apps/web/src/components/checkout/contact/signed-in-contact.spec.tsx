import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  AppErrorCode,
  CustomerRole,
  type CustomerProfileDto,
} from '@vp-parts-shop/shared'
import { ApiError } from '@/lib/api'
import { getCustomerProfile } from '@/lib/api/customers'
import { useAccountSetupStore } from '@/hooks/use-account-setup'
import { SignedInContact } from './signed-in-contact'

jest.mock('@clerk/nextjs', () => ({
  useAuth: jest.fn(() => ({ userId: 'user_1' })),
}))
jest.mock('./complete-profile-contact', () => ({
  CompleteProfileContact: ({ profile }: { profile: CustomerProfileDto }) => (
    <div data-testid="complete-profile-contact" data-email={profile.email} />
  ),
}))
jest.mock('./account-setup-failed-contact', () => ({
  AccountSetupFailedContact: () => <div data-testid="account-setup-failed-contact" />,
}))

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

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <SignedInContact />
      </QueryClientProvider>,
    ),
    queryClient,
  }
}

beforeEach(() => {
  useAccountSetupStore.setState({ failedUserId: null })
  mockedGetProfile.mockReset()
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
    expect(screen.getByText('ivan@example.bg · +359888123456')).toBeInTheDocument()
    expect(screen.getByText('Влязъл')).toBeInTheDocument()
  })

  it('keeps the skeleton while the session sync files a new customer', async () => {
    mockedGetProfile.mockRejectedValue(
      new ApiError(404, AppErrorCode.CUSTOMER_PROFILE_INCOMPLETE),
    )
    renderContact()

    await screen.findByTestId('signed-in-contact-skeleton')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('fills in once the customer is filed', async () => {
    mockedGetProfile.mockRejectedValue(
      new ApiError(404, AppErrorCode.CUSTOMER_PROFILE_INCOMPLETE),
    )
    const { queryClient } = renderContact()
    await screen.findByTestId('signed-in-contact-skeleton')

    act(() => queryClient.setQueryData(['customers', 'me'], PROFILE))

    expect(await screen.findByText('Иван Петров')).toBeInTheDocument()
  })

  // A Google sign-in is filed with no phone; the panel asks for what is missing.
  it('asks an incomplete profile for what it lacks', async () => {
    mockedGetProfile.mockResolvedValue({ ...PROFILE, phoneNumber: null })
    renderContact()

    expect(await screen.findByTestId('complete-profile-contact')).toHaveAttribute(
      'data-email',
      'ivan@example.bg',
    )
    expect(screen.queryByText('Влязъл')).not.toBeInTheDocument()
  })

  it('turns into the card once the profile is complete', async () => {
    mockedGetProfile.mockResolvedValue({ ...PROFILE, phoneNumber: null })
    const { queryClient } = renderContact()
    await screen.findByTestId('complete-profile-contact')

    act(() => queryClient.setQueryData(['customers', 'me'], PROFILE))

    expect(await screen.findByText('Влязъл')).toBeInTheDocument()
    expect(screen.queryByTestId('complete-profile-contact')).not.toBeInTheDocument()
  })

  it('says so in place of the card when the account can never be filed', async () => {
    mockedGetProfile.mockRejectedValue(new ApiError(409, AppErrorCode.EMAIL_ALREADY_EXISTS))
    useAccountSetupStore.getState().reportFailed('user_1')
    renderContact()

    expect(screen.getByTestId('account-setup-failed-contact')).toBeInTheDocument()
    expect(screen.queryByTestId('signed-in-contact-skeleton')).not.toBeInTheDocument()
  })

  it('offers a retry when the profile cannot be read', async () => {
    mockedGetProfile.mockRejectedValueOnce(new ApiError(503, 'UNKNOWN_ERROR'))
    renderContact()

    await screen.findByRole('alert')
    mockedGetProfile.mockResolvedValue(PROFILE)
    await userEvent.click(screen.getByRole('button', { name: 'Опитай отново' }))

    expect(await screen.findByText('Иван Петров')).toBeInTheDocument()
  })

})
