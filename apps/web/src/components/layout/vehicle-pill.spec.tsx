import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SelectedVehicle } from '../../hooks/use-vehicle-context'
import { VehiclePill } from './vehicle-pill'

interface VehicleContextState {
  selectedVehicle: SelectedVehicle | null;
  recentVehicles: SelectedVehicle[];
  setVehicle: jest.Mock;
  clearVehicle: jest.Mock;
}

jest.mock('../../hooks/use-vehicle-context', () => ({
  useVehicleContext: jest.fn(),
}))

jest.mock('../../hooks/use-is-hydrated', () => ({
  useIsHydrated: jest.fn(),
}))

import { useVehicleContext } from '../../hooks/use-vehicle-context'
import { useIsHydrated } from '../../hooks/use-is-hydrated'

const mockedUseIsHydrated = jest.mocked(useIsHydrated)
const mockedUseVehicleContext = jest.mocked(useVehicleContext)

const baseVehicle: SelectedVehicle = {
  vehicleId: 'v-1',
  manufacturerId: '16',
  seriesId: 'ser-10',
  manufacturerName: 'BMW',
  seriesName: '3 Series',
  variantName: 'BMW 320d (F30)',
  engineCodes: ['320i'],
  powerKw: 135,
  powerHp: 184,
  yearFrom: 2015,
  yearTo: 2020,
}

function mockState(selectedVehicle: SelectedVehicle | null) {
  const clearVehicle = jest.fn()
  const setVehicle = jest.fn()
  mockedUseVehicleContext.mockImplementation((selector: (s: VehicleContextState) => unknown) =>
    selector({ selectedVehicle, recentVehicles: [], setVehicle, clearVehicle }),
  )
  return clearVehicle
}

describe('VehiclePill — unhydrated', () => {
  it('renders a loading skeleton before hydration', () => {
    mockedUseIsHydrated.mockReturnValue(false)
    mockState(null)
    const { container } = render(<VehiclePill onOpenSelector={jest.fn()} />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('VehiclePill — no vehicle selected', () => {
  beforeEach(() => {
    mockedUseIsHydrated.mockReturnValue(true)
    mockState(null)
  })

  it('renders the select-vehicle button', () => {
    render(<VehiclePill onOpenSelector={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Избери автомобил' })).toBeInTheDocument()
  })

  it('calls onOpenSelector when the button is clicked', async () => {
    const onOpenSelector = jest.fn()
    render(<VehiclePill onOpenSelector={onOpenSelector} />)
    await userEvent.click(screen.getByRole('button', { name: 'Избери автомобил' }))
    expect(onOpenSelector).toHaveBeenCalledTimes(1)
  })
})

describe('VehiclePill — vehicle selected', () => {
  let clearVehicle: jest.Mock

  beforeEach(() => {
    mockedUseIsHydrated.mockReturnValue(true)
    clearVehicle = mockState(baseVehicle)
  })

  it('shows the manufacturer and series name', () => {
    render(<VehiclePill onOpenSelector={jest.fn()} />)
    expect(screen.getByText('BMW · 3 Series')).toBeInTheDocument()
  })

  it('shows engine, power and year range', () => {
    render(<VehiclePill onOpenSelector={jest.fn()} />)
    expect(screen.getByText(/320i · 135 kW \(184 к.с.\) · 2015–2020/)).toBeInTheDocument()
  })

  // Kilowatts are what the registration document carries; horsepower is what a
  // Bulgarian buyer knows the engine by.
  it('drops to kilowatts alone for a car saved before horsepower was stored', () => {
    mockState({ ...baseVehicle, powerHp: null })
    render(<VehiclePill onOpenSelector={jest.fn()} />)
    expect(screen.getByText(/320i · 135 kW · 2015–2020/)).toBeInTheDocument()
  })

  it('shows a trailing + when yearTo is null', () => {
    mockState({ ...baseVehicle, yearTo: null })
    render(<VehiclePill onOpenSelector={jest.fn()} />)
    expect(screen.getByText(/2015\+/)).toBeInTheDocument()
  })

  it('calls clearVehicle when the clear button is clicked', async () => {
    render(<VehiclePill onOpenSelector={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Изчисти избрания автомобил' }))
    expect(clearVehicle).toHaveBeenCalledTimes(1)
  })

  it('calls onOpenSelector when the vehicle info button is clicked', async () => {
    const onOpenSelector = jest.fn()
    render(<VehiclePill onOpenSelector={onOpenSelector} />)
    await userEvent.click(screen.getByRole('button', { name: 'Промени избрания автомобил' }))
    expect(onOpenSelector).toHaveBeenCalledTimes(1)
  })

  // jsdom resolves the badge's root-relative source against the test origin.
  it("badges the vehicle with its make's mark", () => {
    const { container } = render(<VehiclePill onOpenSelector={jest.fn()} />)
    const src = container.querySelector('img')?.getAttribute('src') ?? ''
    expect(new URL(src).pathname).toBe('/vehicle-makes/bmw.webp')
  })

  // 57 of the 286 selectable makes ship no badge, and the pill keeps the glyph
  // it showed before there were any.
  it('keeps the car glyph for a make with no bundled badge', () => {
    mockState({ ...baseVehicle, manufacturerId: '812' })
    const { container } = render(<VehiclePill onOpenSelector={jest.fn()} />)
    expect(container.querySelector('img')).toBeNull()
  })
})
