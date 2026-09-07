import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { VehicleVariantDto } from '@vp-parts-shop/shared'
import { VehiclePreviewStrip } from './preview-strip'
import type { SelectedMake, SelectedSeries } from './use-vehicle-selector'

const BMW: SelectedMake = { id: '16', name: 'BMW' }
const SERIES_1: SelectedSeries = { id: 's1', manufacturerId: '16', name: '1 (E81)' }

const VARIANT_116D: VehicleVariantDto = {
  vehicleId: 'v-116d',
  seriesId: 's1',
  name: '116 d',
  engineCodes: ['N47 D20 A', 'N47 D20 C'],
  powerKw: 85,
  powerHp: 116,
  displacementLiters: 2,
  yearFrom: 2008,
  yearTo: 2011,
  fuelType: 'Дизел',
  bodyType: 'Хечбек',
  imageUrl: null,
  kbaNumbers: ['0005AOG'],
}

function renderStrip(
  variant: VehicleVariantDto | null = null,
  make: SelectedMake | null = BMW,
  series: SelectedSeries | null = SERIES_1,
  seriesPhotoUrl: string | null = null,
) {
  return render(
    <VehiclePreviewStrip
      selectedMake={make}
      selectedSeries={series}
      pendingVariant={variant}
      seriesPhotoUrl={seriesPhotoUrl}
    />,
  )
}

describe('VehiclePreviewStrip', () => {
  // The sidebar spends the brand step on a hatched panel and a prompt, which is
  // worth a column that is there anyway and not worth taking the height off a
  // grid of 286 makes.
  it('stays out of the way until a make is picked', () => {
    const { container } = renderStrip(null, null, null)

    expect(container).toBeEmptyDOMElement()
  })

  it('names the make as soon as one is picked', () => {
    renderStrip(null, BMW, null)

    expect(screen.getByText('BMW')).toBeInTheDocument()
  })

  // The model is the next answer due, so its place is held rather than the make
  // sitting alone in the strip.
  it('holds the model line with a dash until a model is picked', () => {
    renderStrip(null, BMW, null)

    expect(screen.getByText('BMW').nextElementSibling).toHaveTextContent('—')
  })

  it('names the model once one is picked', () => {
    renderStrip()

    expect(screen.getByText('1 (E81)')).toBeInTheDocument()
  })

  // The engine list is long enough to scroll the picked row off screen, so the
  // strip is what keeps the answer in view.
  it('summarises the picked engine', () => {
    renderStrip(VARIANT_116D)

    expect(screen.getByText('116 d · 85 kW (116 к.с.)')).toBeInTheDocument()
  })

  it('shows the series photo once one is available', () => {
    renderStrip(VARIANT_116D, BMW, SERIES_1, 'https://example.test/e81.jpg')

    expect(screen.getByRole('img', { name: 'BMW 1 (E81)' })).toHaveAttribute(
      'src',
      'https://example.test/e81.jpg',
    )
  })
})

describe('VehiclePreviewStrip — the specification sheet', () => {
  // Every row of it describes an engine, so before one is picked the sheet is
  // six dashes — not worth the height it would take off the list.
  it('offers no sheet until an engine is picked', () => {
    renderStrip(null)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText('KBA код')).not.toBeInTheDocument()
  })

  // Folded away rather than printed: expanded it is taller than the list it
  // sits above, and it is read once, against a registration document, rather
  // than browsed.
  it('keeps the sheet folded away until it is asked for', () => {
    renderStrip(VARIANT_116D)

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('KBA код')).not.toBeInTheDocument()
  })

  it('opens the sheet on demand', async () => {
    renderStrip(VARIANT_116D)

    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('0005AOG')).toBeInTheDocument()
  })

  it('folds the sheet away again', async () => {
    renderStrip(VARIANT_116D)

    await userEvent.click(screen.getByRole('button'))
    await userEvent.click(screen.getByRole('button'))

    expect(screen.queryByText('KBA код')).not.toBeInTheDocument()
  })
})

// The strip and the sidebar carry the same answers at different widths, so
// exactly one of them is ever on screen.
describe('VehiclePreviewStrip — where it applies', () => {
  it('is dropped where the sidebar takes over', () => {
    const { container } = renderStrip(VARIANT_116D)

    expect(container.firstElementChild).toHaveClass('lg:hidden')
  })
})
