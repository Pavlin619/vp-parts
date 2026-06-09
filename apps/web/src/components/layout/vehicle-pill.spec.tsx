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
  useHydration: jest.fn(),
  useVehicleContext: jest.fn(),
}))

import { useHydration, useVehicleContext } from '../../hooks/use-vehicle-context'

const mockedUseHydration = jest.mocked(useHydration)
const mockedUseVehicleContext = jest.mocked(useVehicleContext)

const baseVehicle: SelectedVehicle = {
  vehicleId: 'v-1',
  manufacturerId: 'mfr-5',
  seriesId: 'ser-10',
  manufacturerName: 'BMW',
  seriesName: '3 Series',
  variantName: 'BMW 320d (F30)',
  engine: '320i',
  powerKw: 135,
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
    mockedUseHydration.mockReturnValue(false)
    mockState(null)
    const { container } = render(<VehiclePill onOpenSelector={jest.fn()} />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('VehiclePill — no vehicle selected', () => {
  beforeEach(() => {
    mockedUseHydration.mockReturnValue(true)
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
    mockedUseHydration.mockReturnValue(true)
    clearVehicle = mockState(baseVehicle)
  })

  it('shows the manufacturer and series name', () => {
    render(<VehiclePill onOpenSelector={jest.fn()} />)
    expect(screen.getByText('BMW · 3 Series')).toBeInTheDocument()
  })

  it('shows engine, power and year range', () => {
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
})
