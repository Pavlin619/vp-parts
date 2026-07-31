import { render, screen } from '@testing-library/react'
import { VehicleFitBadge } from './vehicle-fit-badge'

describe('VehicleFitBadge', () => {
  it('renders nothing when no vehicle is selected', () => {
    const { container } = render(<VehicleFitBadge fitsVehicle={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a positive fit message when the part fits', () => {
    render(<VehicleFitBadge fitsVehicle={true} />)
    expect(
      screen.getByText('Подходяща за вашия автомобил'),
    ).toBeInTheDocument()
  })

  it('shows a negative fit message when the part does not fit', () => {
    render(<VehicleFitBadge fitsVehicle={false} />)
    expect(
      screen.getByText('Не е подходяща за вашия автомобил'),
    ).toBeInTheDocument()
  })

  it('includes the vehicle name when provided', () => {
    render(<VehicleFitBadge fitsVehicle={true} vehicleName="VW Golf VII" />)
    expect(screen.getByText('Подходяща за VW Golf VII')).toBeInTheDocument()
  })

  it('renders the box variant with a two-line fit message', () => {
    render(
      <VehicleFitBadge
        fitsVehicle={true}
        vehicleName="AUDI A3 2.0 TDI"
        variant="box"
      />,
    )
    expect(screen.getByText('Пасва на твоя автомобил')).toBeInTheDocument()
    expect(screen.getByText('AUDI A3 2.0 TDI')).toBeInTheDocument()
  })

  it('renders nothing in the box variant when no vehicle is selected', () => {
    const { container } = render(
      <VehicleFitBadge fitsVehicle={null} variant="box" />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
