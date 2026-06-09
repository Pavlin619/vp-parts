import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VehiclesPage from './page'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn()
const mockBack = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}))

jest.mock('../../../components/catalog/vehicle-selector', () => ({
  VehicleSelector: ({
    isOpen,
    onClose,
    onConfirm,
  }: {
    isOpen: boolean
    onClose: () => void
    onConfirm?: () => void
  }) =>
    isOpen ? (
      <div data-testid="vehicle-selector">
        <button onClick={onClose}>Отказ</button>
        <button onClick={onConfirm}>Потвърди</button>
      </div>
    ) : null,
}))

beforeEach(() => {
  mockPush.mockClear()
  mockBack.mockClear()
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('VehiclesPage', () => {
  it('renders VehicleSelector open by default', () => {
    render(<VehiclesPage />)
    expect(screen.getByTestId('vehicle-selector')).toBeInTheDocument()
  })

  it('closes the modal and navigates back on cancel', async () => {
    render(<VehiclesPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Отказ' }))
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('vehicle-selector')).not.toBeInTheDocument()
  })

  it('closes the modal and navigates to "/" on confirm', async () => {
    render(<VehiclesPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Потвърди' }))
    expect(mockPush).toHaveBeenCalledWith('/')
    expect(screen.queryByTestId('vehicle-selector')).not.toBeInTheDocument()
  })
})
