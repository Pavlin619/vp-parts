import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SelectedVehicle } from '../../hooks/use-vehicle-context'
import { VehicleFinderManual } from './vehicle-finder-manual'

const VEHICLE: SelectedVehicle = {
  vehicleId: 'v-1',
  manufacturerId: 'mfr-16',
  seriesId: 'ser-1234',
  manufacturerName: 'AUDI',
  seriesName: '80 B4 Avant (8C5)',
  variantName: '2.0 E',
  engine: 'ABT',
  powerKw: 66,
  powerHp: 90,
  yearFrom: 1992,
  yearTo: 1996,
}

function renderManual(vehicle: SelectedVehicle | null) {
  const onOpenSelector = jest.fn()

  render(<VehicleFinderManual vehicle={vehicle} onOpenSelector={onOpenSelector} />)

  return { onOpenSelector }
}

describe('VehicleFinderManual — step chips', () => {
  it('numbers the three fields while nothing is picked', () => {
    renderManual(null)

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  // The store holds a whole vehicle or none of one, so there is no state in
  // which the make is answered and the model is not.
  it('ticks every field at once, since one pass answers all three', () => {
    renderManual(VEHICLE)

    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  // "Избери марка 1" reads the ordinal as part of the make, and the field's own
  // name already says which step it is.
  it('keeps the chip out of every field name', () => {
    renderManual(null)

    expect(screen.getByRole('button', { name: 'Избери марка' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Избери модел' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Избери двигател' })).toBeInTheDocument()
  })
})

describe('VehicleFinderManual — values', () => {
  it('prints the picked names over the placeholders', () => {
    renderManual(VEHICLE)

    expect(screen.getByRole('button', { name: 'Марка: AUDI' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Модел: 80 B4 Avant (8C5)' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Двигател: 2.0 E' })).toBeInTheDocument()
  })

  // All three open the same dialog: it does its own stepping, so a visitor who
  // reaches for Двигател first is not sent to a dead control.
  it('opens the selector from any field, answered or not', async () => {
    const { onOpenSelector } = renderManual(null)

    await userEvent.click(screen.getByRole('button', { name: 'Избери марка' }))
    await userEvent.click(screen.getByRole('button', { name: 'Избери модел' }))
    await userEvent.click(screen.getByRole('button', { name: 'Избери двигател' }))

    expect(onOpenSelector).toHaveBeenCalledTimes(3)
  })
})

// VIN and plate lookup are unlicensed, so an input for either is a control that
// cannot answer.
describe('VehicleFinderManual — no VIN entry', () => {
  it('offers no VIN field and no alternative to the three steps', () => {
    renderManual(null)

    expect(screen.queryByPlaceholderText(/VIN/i)).not.toBeInTheDocument()
    expect(screen.queryByText('или')).not.toBeInTheDocument()
  })
})
