import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomerRole, type CustomerProfileDto } from '@vp-parts-shop/shared'
import { updateCustomerProfile } from '@/lib/api/customers'
import { CompleteProfileContact } from './complete-profile-contact'

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

const NO_PHONE: CustomerProfileDto = { ...COMPLETE, phoneNumber: null }

function renderContact(profile: CustomerProfileDto) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  render(<CompleteProfileContact profile={profile} />, { wrapper })

  return { queryClient }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(updateCustomerProfile).mockResolvedValue(COMPLETE)
})

describe('CompleteProfileContact', () => {
  describe('for a profile missing only the phone', () => {
    it('says who signed in and that only the phone is left', () => {
      renderContact(NO_PHONE)

      expect(screen.getByText('Иван Петров')).toBeInTheDocument()
      expect(screen.getByText('ivan@gmail.com')).toBeInTheDocument()
      expect(screen.getByText('Липсва телефон')).toBeInTheDocument()
      expect(screen.getByText('Остава само телефонът')).toBeInTheDocument()
      expect(screen.getByLabelText('Мобилен телефон')).toBeInTheDocument()
    })

    it('asks for no name it already has', () => {
      renderContact(NO_PHONE)

      expect(screen.queryByLabelText('Име')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Фамилия')).not.toBeInTheDocument()
    })

    it('names an invalid phone under the field', async () => {
      const user = userEvent.setup()
      renderContact(NO_PHONE)

      await user.click(screen.getByRole('button', { name: 'Запази телефона' }))

      expect(screen.getByLabelText('Мобилен телефон')).toHaveAccessibleDescription(
        'Въведете валиден мобилен номер',
      )
      expect(updateCustomerProfile).not.toHaveBeenCalled()
    })

    it('saves the phone to the profile', async () => {
      const user = userEvent.setup()
      const { queryClient } = renderContact(NO_PHONE)

      await user.type(screen.getByLabelText('Мобилен телефон'), '0888123456')
      await user.click(screen.getByRole('button', { name: 'Запази телефона' }))

      expect(updateCustomerProfile).toHaveBeenCalledWith({ phoneNumber: '+359888123456' })
      await waitFor(() =>
        expect(queryClient.getQueryData(['customers', 'me'])).toEqual(COMPLETE),
      )
    })
  })

  // A Google account need not have a last name.
  it('asks for a missing last name beside the phone', async () => {
    const user = userEvent.setup()
    renderContact({ ...NO_PHONE, lastName: null })

    expect(screen.getByText('Допълнете профила си')).toBeInTheDocument()
    expect(screen.getByText('Непълен профил')).toBeInTheDocument()
    expect(screen.queryByLabelText('Име')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Фамилия'), 'Петров')
    await user.type(screen.getByLabelText('Мобилен телефон'), '0888123456')
    await user.click(screen.getByRole('button', { name: 'Запази данните' }))

    expect(updateCustomerProfile).toHaveBeenCalledWith({
      lastName: 'Петров',
      phoneNumber: '+359888123456',
    })
  })

  it('shows the email in place of a name the profile does not have yet', () => {
    renderContact({ ...NO_PHONE, firstName: null, lastName: null })

    expect(screen.getByText('ivan@gmail.com')).toBeInTheDocument()
    expect(screen.getByLabelText('Име')).toBeInTheDocument()
    expect(screen.getByLabelText('Фамилия')).toBeInTheDocument()
  })

  it('says when the details could not be saved', async () => {
    const user = userEvent.setup()
    jest.mocked(updateCustomerProfile).mockRejectedValue(new Error('offline'))
    renderContact(NO_PHONE)

    await user.type(screen.getByLabelText('Мобилен телефон'), '0888123456')
    await user.click(screen.getByRole('button', { name: 'Запази телефона' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не успяхме да запазим данните. Опитайте отново.',
    )
  })
})
