import { render, screen } from '@testing-library/react'
import { AccountSetupFailedContact } from './account-setup-failed-contact'

describe('AccountSetupFailedContact', () => {
  it('says the account could not be set up and asks the customer to contact us', () => {
    render(<AccountSetupFailedContact />)

    expect(screen.getByRole('alert')).toHaveTextContent('Профилът ви не можа да бъде създаден')
    expect(screen.getByText(/Свържете се с нас/)).toBeInTheDocument()
  })
})
