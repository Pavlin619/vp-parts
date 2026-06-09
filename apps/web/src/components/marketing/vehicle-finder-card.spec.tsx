import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VehicleFinderCard } from './vehicle-finder-card'

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../../hooks/use-vehicle-context', () => ({
  useHydration: jest.fn(() => true),
  useVehicleContext: jest.fn(() => null),
}))

jest.mock('../catalog/vehicle-selector', () => ({
  VehicleSelector: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="vehicle-selector-modal" /> : null,
}))

jest.mock('./vehicle-finder-manual', () => ({
  VehicleFinderManual: ({ onOpenSelector }: { onOpenSelector: () => void }) => (
    <button onClick={onOpenSelector} data-testid="open-selector-trigger">
      Ръчно режим
    </button>
  ),
}))

jest.mock('./recent-vehicles-list', () => ({
  RecentVehiclesList: () => null,
}))

jest.mock('./vehicle-finder-search-input', () => ({
  VehicleFinderSearchInput: ({ placeholder }: { placeholder: string }) => (
    <input placeholder={placeholder} />
  ),
}))

// ── Tests ──────────────────────────────────────────────────────────────────

describe('VehicleFinderCard — mode tabs', () => {
  it('renders all three mode tabs', () => {
    render(<VehicleFinderCard />)
    expect(screen.getByRole('button', { name: 'Ръчно' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'VIN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Рег. №' })).toBeInTheDocument()
  })

  it('shows manual mode content by default', () => {
    render(<VehicleFinderCard />)
    expect(screen.getByTestId('open-selector-trigger')).toBeInTheDocument()
  })

  it('switches to VIN mode and shows VIN input', async () => {
    render(<VehicleFinderCard />)
    await userEvent.click(screen.getByRole('button', { name: 'VIN' }))
    expect(screen.queryByTestId('open-selector-trigger')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('ВЪВЕДИ VIN (17 СИМВОЛА)')).toBeInTheDocument()
  })

  it('switches to plate mode and shows plate input', async () => {
    render(<VehicleFinderCard />)
    await userEvent.click(screen.getByRole('button', { name: 'Рег. №' }))
    expect(screen.getByPlaceholderText('ВЪВЕДИ РЕГ. НОМЕР')).toBeInTheDocument()
  })
})

describe('VehicleFinderCard — vehicle selector modal', () => {
  it('modal is closed initially', () => {
    render(<VehicleFinderCard />)
    expect(screen.queryByTestId('vehicle-selector-modal')).not.toBeInTheDocument()
  })

  it('opens the VehicleSelector when onOpenSelector is triggered', async () => {
    render(<VehicleFinderCard />)
    await userEvent.click(screen.getByTestId('open-selector-trigger'))
    expect(screen.getByTestId('vehicle-selector-modal')).toBeInTheDocument()
  })
})

describe('VehicleFinderCard — CTA', () => {
  it('renders a link to /catalog', () => {
    render(<VehicleFinderCard />)
    const link = screen.getByRole('link', { name: /към каталога/i })
    expect(link).toHaveAttribute('href', '/catalog')
  })
})
