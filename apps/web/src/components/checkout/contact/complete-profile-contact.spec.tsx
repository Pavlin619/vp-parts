import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useUser } from '@clerk/nextjs'
import { CustomerRole, type CustomerProfileDto } from '@vp-parts-shop/shared'
import { fileCustomer } from '@/lib/api/customers'
import { CompleteProfileContact } from './complete-profile-contact'

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

const SUBMIT = 'Запази телефона'

const updateMetadata = jest.fn()

function renderContact(onComplete = jest.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  render(<CompleteProfileContact onComplete={onComplete} />, { wrapper })

  return { onComplete }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useUser).mockReturnValue({
    user: {
      updateMetadata,
      firstName: 'Иван',
      lastName: 'Петров',
      primaryEmailAddress: { emailAddress: 'ivan@gmail.com' },
    },
  } as unknown as ReturnType<typeof useUser>)
  updateMetadata.mockResolvedValue({})
  jest.mocked(fileCustomer).mockResolvedValue(PROFILE)
})

describe('CompleteProfileContact', () => {
  it('says who signed in and that the phone is still missing', () => {
    renderContact()

    expect(screen.getByText('Иван Петров')).toBeInTheDocument()
    expect(screen.getByText('ivan@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('Липсва телефон')).toBeInTheDocument()
    expect(screen.getByText('Остава само телефонът')).toBeInTheDocument()
    expect(screen.getByLabelText('Мобилен телефон')).toBeInTheDocument()
  })

  it('names an invalid phone under the field', async () => {
    const user = userEvent.setup()
    renderContact()

    await user.click(screen.getByRole('button', { name: SUBMIT }))

    expect(screen.getByLabelText('Мобилен телефон')).toHaveAccessibleDescription(
      'Въведете валиден мобилен номер',
    )
    expect(updateMetadata).not.toHaveBeenCalled()
  })

  it('completes once the phone is saved', async () => {
    const user = userEvent.setup()
    const { onComplete } = renderContact()

    await user.type(screen.getByLabelText('Мобилен телефон'), '0888123456')
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
  })

})
