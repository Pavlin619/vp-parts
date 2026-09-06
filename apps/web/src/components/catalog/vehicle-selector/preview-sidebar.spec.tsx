import { fireEvent, render, screen } from '@testing-library/react'
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
  fuelType: 'Diesel',
  bodyType: 'Saloon',
  imageUrl: 'https://example.test/e90.jpg',
  kbaNumbers: ['0005BGJ'],
}

/** The photo frame: the first child of the sidebar column. */
function frameOf(container: HTMLElement) {
  return container.firstElementChild?.firstElementChild
}

/** The badge's path, which jsdom resolves against the test origin. */
function badgePathOf(container: HTMLElement) {
  return container.querySelector('img')?.getAttribute('src')
}

/** The value cell of one row of the specification sheet. */
function valueOf(label: string) {
  const value = screen.getByText(label).closest('div')?.querySelector('dd')

  if (!value) throw new Error(`no value cell for ${label}`)

  return value
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

  // A variant still in production has no end year, which is a real state rather
  // than missing data.
  it('reads an open-ended production run as still current', () => {
    renderWith({ ...VARIANT_320D, yearTo: null })

    expect(screen.getByText('2011+')).toBeInTheDocument()
  })
})

describe('VehiclePreviewSidebar — the specification sheet', () => {
  // The four rows that identify a car are on screen from the first paint, so
  // the sheet fills in rather than growing. Displacement and fuel describe the
  // engine, and every row of the engine list prints both.
  it('prints the identifying rows with a dash before anything is picked', () => {
    renderWith(null, null, null, null)

    for (const label of ['Година', 'Двигател', 'Мощност', 'KBA код']) {
      expect(valueOf(label)).toHaveTextContent('—')
    }

    expect(screen.queryByText('Обем')).not.toBeInTheDocument()
    expect(screen.queryByText('Гориво')).not.toBeInTheDocument()
  })

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

  // A third of variants are built with more than one engine — a Mercedes
  // E 300 CDI files OM 642.852 and OM 642.850 — and the visitor is matching
  // this against the code stamped on the block in front of them.
  it('prints every engine code filed for the variant', () => {
    renderWith({ ...VARIANT_320D, engineCodes: ['OM 642.852', 'OM 642.850'] })

    expect(valueOf('Двигател')).toHaveTextContent('OM 642.852, OM 642.850')
  })

  it('dashes the engine row for a variant with no code filed', () => {
    renderWith({ ...VARIANT_320D, engineCodes: [] })

    expect(valueOf('Двигател')).toHaveTextContent('—')
  })

  it('dashes the engine row for a variant cached without the field', () => {
    const cachedBeforeTheField = { ...VARIANT_320D, engineCodes: undefined }

    renderWith(cachedBeforeTheField as unknown as VehicleVariantDto)

    expect(valueOf('Двигател')).toHaveTextContent('—')
  })

  // A variant sold under two type approvals carries both, and the visitor is
  // matching this against a registration document naming one of them.
  it('prints every type-approval number filed for the variant', () => {
    renderWith({ ...VARIANT_320D, kbaNumbers: ['0603BLP', '0603BOF'] })

    expect(valueOf('KBA код')).toHaveTextContent('0603BLP, 0603BOF')
  })

  // 4% of live variants have none filed, which is missing data rather than a
  // failed read.
  it('dashes the type-approval row for a variant with none filed', () => {
    renderWith({ ...VARIANT_320D, kbaNumbers: [] })

    expect(valueOf('KBA код')).toHaveTextContent('—')
  })

  // The API caches variants for a day, so a release reaching the web first is
  // answered from entries filed before the field existed. The cast is the payload
  // that really arrives: unknown has to cost a dash, not the whole dialog.
  it('dashes the type-approval row for a variant cached without the field', () => {
    const cachedBeforeTheField = { ...VARIANT_320D, kbaNumbers: undefined }

    renderWith(cachedBeforeTheField as unknown as VehicleVariantDto)

    expect(valueOf('KBA код')).toHaveTextContent('—')
  })
})

describe('VehiclePreviewSidebar — the frame', () => {
  // The photo belongs to the series, so it shows as soon as a model is picked
  // rather than waiting for an engine.
  it('shows the car as soon as a series photo is available', () => {
    renderWith(null, 'https://example.test/e90.jpg')

    const photo = screen.getByRole('img', { name: 'BMW 3 Series' })
    expect(photo).toBeInTheDocument()
    expect(photo).toHaveAttribute('src', 'https://example.test/e90.jpg')
  })

  // 12.6% of variants and a handful of whole series have no photo filed, so the
  // make's own badge is what the frame carries most of the time — the whole
  // brand step is spent on it.
  it('falls back to the make badge when there is no photo', () => {
    const { container } = renderWith(VARIANT_320D, null)

    expect(badgePathOf(container)).toContain('/vehicle-makes/bmw.webp')
    expect(screen.queryByTestId('make-wordmark')).not.toBeInTheDocument()
  })

  // 57 of the 286 selectable makes have no badge bundled, so the wordmark has to
  // reach the frame as well as the grid.
  it('falls back to a wordmark for a make with no badge', () => {
    const { container } = renderWith(null, null, { id: '812', name: 'GLAS' }, null)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTestId('make-wordmark')).toHaveTextContent('GLAS')
  })

  it('holds a hatched panel until a make is picked', () => {
    const { container } = renderWith(null, null, null, null)

    expect(frameOf(container)).toHaveClass('hatched', 'bg-bg-sunken')
    expect(screen.getByText('Лого · фото на модел')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  // TecDoc bakes a white background into the photo, and the badges are drawn for
  // white — 28 of them opaque rather than transparent — so both frame in white.
  it('frames a photo and a badge in white', () => {
    const withPhoto = renderWith(null, 'https://example.test/e90.jpg')
    expect(frameOf(withPhoto.container)).toHaveClass('bg-white')
    withPhoto.unmount()

    const withBadge = renderWith(null, null)
    expect(frameOf(withBadge.container)).toHaveClass('bg-white')
  })

  // A token that died in the cache must cost the badge, not the browser's
  // broken-image icon. This is what makes a cache TTL an acceptable bet.
  it('falls back to the badge when the photo fails to load', () => {
    const { container } = renderWith(VARIANT_320D, 'https://example.test/dead-token.jpg')

    fireEvent.error(screen.getByRole('img', { name: 'BMW 3 Series' }))

    expect(screen.queryByRole('img', { name: 'BMW 3 Series' })).not.toBeInTheDocument()
    expect(badgePathOf(container)).toContain('/vehicle-makes/bmw.webp')
  })

  // Otherwise one dead photo would suppress every later one in the same dialog.
  it('retries the photo when the visitor picks a different model', () => {
    const { rerender } = renderWith(VARIANT_320D, 'https://example.test/dead-token.jpg')
    fireEvent.error(screen.getByRole('img', { name: 'BMW 3 Series' }))

    rerender(
      <VehiclePreviewSidebar
        selectedMake={BMW}
        selectedSeries={SERIES_3}
        pendingVariant={VARIANT_320D}
        seriesPhotoUrl="https://example.test/fresh-token.jpg"
      />,
    )

    expect(screen.getByRole('img', { name: 'BMW 3 Series' })).toHaveAttribute(
      'src',
      'https://example.test/fresh-token.jpg',
    )
  })

  // All three states share one ratio, so the panel does not resize under the
  // visitor when a make is picked or a photo arrives.
  it('keeps the frame the same shape in every state', () => {
    const states: Array<[VehicleVariantDto | null, string | null, SelectedMake | null]> = [
      [null, 'https://example.test/e90.jpg', BMW],
      [null, null, BMW],
      [null, null, null],
    ]

    for (const [variant, photoUrl, make] of states) {
      const view = renderWith(variant, photoUrl, make, null)
      expect(frameOf(view.container)).toHaveClass('aspect-[16/9]')
      view.unmount()
    }
  })
})
