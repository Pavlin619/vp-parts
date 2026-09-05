import { fireEvent, render, screen } from '@testing-library/react'
import type { ModelSeriesDto, VehicleVariantDto } from '@vp-parts-shop/shared'
import { VehiclePreviewSidebar } from './preview-sidebar'
import type { SelectedMake } from './use-vehicle-selector'

const BMW: SelectedMake = { id: '16', name: 'BMW' }
const SERIES_3: ModelSeriesDto = { id: 's3', manufacturerId: '16', name: '3 Series' }

const VARIANT_320D: VehicleVariantDto = {
  vehicleId: 'v-320d',
  seriesId: 's3',
  name: '320 d',
  engine: 'N47D20C',
  powerKw: 135,
  powerHp: 184,
  displacementLiters: 2,
  yearFrom: 2011,
  yearTo: 2019,
  fuelType: 'Diesel',
  bodyType: 'Saloon',
  imageUrl: 'https://example.test/e90.jpg',
}

/** The photo frame: the first child of the sidebar column. */
function frameOf(container: HTMLElement) {
  return container.firstElementChild?.firstElementChild
}

function renderWith(variant: VehicleVariantDto | null, seriesPhotoUrl: string | null = null) {
  return render(
    <VehiclePreviewSidebar
      selectedMake={BMW}
      selectedSeries={SERIES_3}
      pendingVariant={variant}
      seriesPhotoUrl={seriesPhotoUrl}
    />,
  )
}

describe('VehiclePreviewSidebar', () => {
  it('shows power in both kilowatts and horsepower', () => {
    renderWith(VARIANT_320D)

    expect(screen.getByText('135 kW (184 к.с.)')).toBeInTheDocument()
  })

  it('shows displacement to one decimal place', () => {
    renderWith(VARIANT_320D)

    expect(screen.getByText('Обем')).toBeInTheDocument()
    expect(screen.getByText('2.0 л')).toBeInTheDocument()
  })

  // An electric variant has no displacement, and an empty row reads as missing
  // data rather than as a car that has none.
  it('omits the displacement row for a variant with no displacement', () => {
    renderWith({ ...VARIANT_320D, displacementLiters: null, fuelType: 'Electric' })

    expect(screen.queryByText('Обем')).not.toBeInTheDocument()
  })

  it('shows no specification rows until a variant is picked', () => {
    renderWith(null)

    expect(screen.queryByText('Мощност')).not.toBeInTheDocument()
    expect(screen.queryByText('Обем')).not.toBeInTheDocument()
  })
})

describe('VehiclePreviewSidebar — photo', () => {
  // The photo belongs to the series, so it shows as soon as a model is picked
  // rather than waiting for an engine.
  it('shows the car as soon as a series photo is available', () => {
    renderWith(null, 'https://example.test/e90.jpg')

    const photo = screen.getByRole('img', { name: 'BMW 3 Series' })
    expect(photo).toBeInTheDocument()
    expect(photo).toHaveAttribute('src', 'https://example.test/e90.jpg')
  })

  // 12.6% of variants and a handful of whole series have no photo filed, so the
  // icon placeholder has to stay rather than leaving an empty frame.
  it('falls back to the make and model text when there is no photo', () => {
    renderWith(VARIANT_320D, null)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(/BMW · 3 Series/)).toBeInTheDocument()
  })

  // TecDoc bakes a white background into the asset, so a coloured frame draws
  // the photo as a white box inside a coloured one.
  it('frames the photo in white and the placeholder in the sunken surface', () => {
    const withPhoto = renderWith(null, 'https://example.test/e90.jpg')
    expect(frameOf(withPhoto.container)).toHaveClass('bg-white')
    withPhoto.unmount()

    const withoutPhoto = renderWith(null, null)
    expect(frameOf(withoutPhoto.container)).toHaveClass('bg-bg-sunken')
  })

  // A token that died in the cache must cost a placeholder, not the browser's
  // broken-image icon. This is what makes a cache TTL an acceptable bet.
  it('falls back to the placeholder when the photo fails to load', async () => {
    renderWith(VARIANT_320D, 'https://example.test/dead-token.jpg')

    fireEvent.error(screen.getByRole('img'))

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(/BMW · 3 Series/)).toBeInTheDocument()
  })

  // Otherwise one dead photo would suppress every later one in the same dialog.
  it('retries the photo when the visitor picks a different model', () => {
    const { rerender } = renderWith(VARIANT_320D, 'https://example.test/dead-token.jpg')
    fireEvent.error(screen.getByRole('img'))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    rerender(
      <VehiclePreviewSidebar
        selectedMake={BMW}
        selectedSeries={SERIES_3}
        pendingVariant={VARIANT_320D}
        seriesPhotoUrl="https://example.test/fresh-token.jpg"
      />,
    )

    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.test/fresh-token.jpg',
    )
  })

  // Both states share the asset's ratio, so the frame does not resize under the
  // visitor when the photo arrives.
  it('keeps the frame the same shape whether or not a photo is present', () => {
    const withPhoto = renderWith(null, 'https://example.test/e90.jpg')
    expect(frameOf(withPhoto.container)).toHaveClass('aspect-[800/287]')
    withPhoto.unmount()

    const withoutPhoto = renderWith(null, null)
    expect(frameOf(withoutPhoto.container)).toHaveClass('aspect-[800/287]')
  })
})
