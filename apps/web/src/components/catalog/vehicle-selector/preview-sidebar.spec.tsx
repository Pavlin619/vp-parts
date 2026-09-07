import { render, screen } from '@testing-library/react'
import type { VehicleVariantDto } from '@vp-parts-shop/shared'
import { VehiclePreviewSidebar } from './preview-sidebar'
import type { SelectedMake, SelectedSeries } from './use-vehicle-selector'

const BMW: SelectedMake = { id: '16', name: 'BMW' }
const SERIES_3: SelectedSeries = { id: 's3', manufacturerId: '16', name: '3 Series' }

const VARIANT_320D: VehicleVariantDto = {
  vehicleId: 'v-320d',
  seriesId: 's3',
  name: '320 d',
  engineCodes: ['N47D20C'],
  powerKw: 135,
  powerHp: 184,
  displacementLiters: 2,
  yearFrom: 2011,
  yearTo: 2019,
  fuelType: 'Дизел',
  bodyType: 'Седан',
  imageUrl: 'https://example.test/e90.jpg',
  kbaNumbers: ['0005BGJ'],
}

function renderWith(
  variant: VehicleVariantDto | null,
  seriesPhotoUrl: string | null = null,
  make: SelectedMake | null = BMW,
  series: SelectedSeries | null = SERIES_3,
) {
  return render(
    <VehiclePreviewSidebar
      selectedMake={make}
      selectedSeries={series}
      pendingVariant={variant}
      seriesPhotoUrl={seriesPhotoUrl}
    />,
  )
}

describe('VehiclePreviewSidebar', () => {
  it('prompts for a make until one is picked', () => {
    renderWith(null, null, null, null)

    expect(screen.getByText('Избери марка…')).toBeInTheDocument()
  })

  // The model is the next answer due, so its place is held rather than the make
  // sitting alone above the sheet.
  it('holds the model line with a dash once a make is picked', () => {
    renderWith(null, null, BMW, null)

    expect(screen.getByText('BMW').nextElementSibling).toHaveTextContent('—')
  })

  it('prints the picked car above its specification sheet', () => {
    renderWith(VARIANT_320D, 'https://example.test/e90.jpg')

    expect(screen.getByRole('img', { name: 'BMW 3 Series' })).toBeInTheDocument()
    expect(screen.getByText('3 Series')).toBeInTheDocument()
    expect(screen.getByText('135 kW (184 к.с.)')).toBeInTheDocument()
  })

  // The strip and the sidebar carry the same answers at different widths, so
  // exactly one of them is ever on screen.
  it('is dropped where the strip takes over', () => {
    const { container } = renderWith(VARIANT_320D)

    expect(container.firstElementChild).toHaveClass('hidden', 'lg:flex')
  })
})
