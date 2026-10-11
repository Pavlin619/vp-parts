import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useClerk } from '@clerk/nextjs'
import { useSessionSync } from '@/hooks/use-session-sync'
import { SessionSync } from './session-sync'

jest.mock('@clerk/nextjs', () => ({ useClerk: jest.fn() }))
jest.mock('@/hooks/use-session-sync')

const mockedUseSessionSync = jest.mocked(useSessionSync)
const signOut = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(useClerk as jest.Mock).mockReturnValue({ signOut })
})

describe('SessionSync', () => {
  it('renders nothing while the account is in order', () => {
    mockedUseSessionSync.mockReturnValue({ hasAccountSetupFailed: false })

    const { container } = render(<SessionSync />)

    expect(container).toBeEmptyDOMElement()
  })

  // Reachable only with tampered metadata or a user made in the Clerk
  // dashboard; nothing the customer does on the page can fix it.
  describe('when the account could not be set up', () => {
    beforeEach(() => {
      mockedUseSessionSync.mockReturnValue({ hasAccountSetupFailed: true })
    })

    it('says so and asks the customer to contact us', () => {
      render(<SessionSync />)

      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(screen.getByText('Профилът ви не можа да бъде създаден')).toBeInTheDocument()
      expect(screen.getByText(/Свържете се с нас/)).toBeInTheDocument()
    })

    it('offers a way out by signing out', async () => {
      render(<SessionSync />)

      await userEvent.click(screen.getByRole('button', { name: 'Изход' }))

      expect(signOut).toHaveBeenCalled()
    })
  })
})
