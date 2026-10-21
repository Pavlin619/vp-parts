import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRegistrationDraft } from '@/hooks/use-registration-draft'
import { GuestAccountInvite } from './guest-account-invite'

const CONTACT = {
  firstName: 'Мария',
  lastName: 'Иванова',
  phoneNumber: '+359888765432',
  email: 'maria@example.com',
}

beforeEach(() => useRegistrationDraft.getState().clear())

describe('GuestAccountInvite', () => {
  // This order stays a guest's: only a verified email may later link one to an account.
  it('offers an account for the orders to come, promising nothing for this one', () => {
    render(<GuestAccountInvite contact={CONTACT} />)

    expect(screen.getByText(/следващите си поръчки/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Създайте профил' })).toHaveAttribute(
      'href',
      '/sign-up',
    )
  })

  it('hands the order’s contact to the registration form', async () => {
    render(<GuestAccountInvite contact={CONTACT} />)

    await userEvent.click(screen.getByRole('link', { name: 'Създайте профил' }))

    expect(useRegistrationDraft.getState().draft).toEqual(CONTACT)
  })

  it('hands over no email the guest did not give', async () => {
    render(<GuestAccountInvite contact={{ ...CONTACT, email: null }} />)

    await userEvent.click(screen.getByRole('link', { name: 'Създайте профил' }))

    expect(useRegistrationDraft.getState().draft).toEqual({
      firstName: 'Мария',
      lastName: 'Иванова',
      phoneNumber: '+359888765432',
    })
  })
})
