import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { VehicleVariantDto } from '@vp-parts-shop/shared'
import type { SelectedVehicle } from '@/hooks/use-vehicle-context'
import { VehicleHero } from './vehicle-hero'

const selectedVariantMock = jest.fn<VehicleVariantDto | null, []>()
const seriesPhotoMock = jest.fn<string | null, []>()

jest.mock('@/hooks/use-selected-variant', () => ({
  useSelectedVariant: () => selectedVariantMock(),
}))

jest.mock('@/hooks/use-series-photo', () => ({
  useSeriesPhoto: () => seriesPhotoMock(),
}))

const VEHICLE: SelectedVehicle = {
  vehicleId: '13074',
  manufacturerId: '5',
  seriesId: '2439',
  manufacturerName: 'AUDI',
  seriesName: 'A3 (8L1)',
  variantName: '1.8 T',
  engineCodes: ['AGU', 'ARX'],
  powerKw: 110,
  powerHp: 150,
  yearFrom: 1996,
  yearTo: 2003,
}

const VARIANT: VehicleVariantDto = {
  vehicleId: '13074',
  seriesId: '2439',
  name: '1.8 T',
  yearFrom: 1996,
  yearTo: 2003,
  engineCodes: ['AGU', 'ARX'],
  powerKw: 110,
  powerHp: 150,
  displacementLiters: 1.8,
  fuelType: 'Бензин',
  bodyType: 'Хечбек',
  kbaNumbers: ['0588/449'],
  imageUrl: null,
}

function renderHero() {
  const onEdit = jest.fn()
  const onClear = jest.fn()
  render(<VehicleHero vehicle={VEHICLE} onEdit={onEdit} onClear={onClear} />)
  return { onEdit, onClear }
}

beforeEach(() => {
  selectedVariantMock.mockReturnValue(VARIANT)
  seriesPhotoMock.mockReturnValue(null)
})

describe('VehicleHero', () => {
  it('names the car', () => {
    renderHero()
    expect(screen.getByRole('heading', { name: 'AUDI A3 (8L1)' })).toBeInTheDocument()
  })

  it('spells out the engine line from the variant', () => {
    renderHero()
    expect(screen.getByText('1.8 T · 1.8 л · 110 kW (150 к.с.)')).toBeInTheDocument()
  })

  it('prints the full spec sheet once the variant has arrived', () => {
    renderHero()
    expect(screen.getByText('AGU, ARX')).toBeInTheDocument()
    expect(screen.getByText('1996–2003')).toBeInTheDocument()
    expect(screen.getByText('Хечбек')).toBeInTheDocument()
    expect(screen.getByText('0588/449')).toBeInTheDocument()
  })

  // The store carries neither body type nor KBA numbers, so the sheet is short
  // until the variant list resolves — dashes would read as a failed load.
  it('omits the specs it cannot answer yet', () => {
    selectedVariantMock.mockReturnValue(null)
    renderHero()

    expect(screen.getByText('AGU, ARX')).toBeInTheDocument()
    expect(screen.queryByText('Каросерия')).not.toBeInTheDocument()
    expect(screen.queryByText('KBA код')).not.toBeInTheDocument()
  })

  it('shows the series photo when TecDoc has one', () => {
    seriesPhotoMock.mockReturnValue('https://example.test/a3.jpg')
    renderHero()
    expect(screen.getByRole('img', { name: 'AUDI A3 (8L1)' })).toHaveAttribute(
      'src',
      'https://example.test/a3.jpg',
    )
  })

  it('falls back to a reserved frame when there is no photo', () => {
    renderHero()
    expect(screen.getByText('Фото на модел')).toBeInTheDocument()
  })

  it('offers to change and to clear the car', async () => {
    const { onEdit, onClear } = renderHero()

    await userEvent.click(screen.getByRole('button', { name: /Промени/ }))
    expect(onEdit).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: /Премахни/ }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
