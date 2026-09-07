import { render, screen } from '@testing-library/react'
import type { VehicleVariantDto } from '@vp-parts-shop/shared'
import { VehicleSpecGrid, VehicleSpecSheet } from './preview-specs'

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

/** The value cell of one row of the specification sheet. */
function valueOf(label: string) {
  const value = screen.getByText(label).closest('div')?.querySelector('dd')

  if (!value) throw new Error(`no value cell for ${label}`)

  return value
}

function renderSheet(variant: VehicleVariantDto | null) {
  return render(<VehicleSpecSheet variant={variant} />)
}

describe('VehicleSpecSheet', () => {
  it('shows power in both kilowatts and horsepower', () => {
    renderSheet(VARIANT_320D)

    expect(screen.getByText('135 kW (184 к.с.)')).toBeInTheDocument()
  })

  it('shows displacement to one decimal place', () => {
    renderSheet(VARIANT_320D)

    expect(screen.getByText('Обем')).toBeInTheDocument()
    expect(screen.getByText('2.0 л')).toBeInTheDocument()
  })

  // An electric variant has no displacement, and an empty row reads as missing
  // data rather than as a car that has none.
  it('omits the displacement row for a variant with no displacement', () => {
    renderSheet({ ...VARIANT_320D, displacementLiters: null, fuelType: 'Електричество' })

    expect(screen.queryByText('Обем')).not.toBeInTheDocument()
  })

  // A variant still in production has no end year, which is a real state rather
  // than missing data.
  it('reads an open-ended production run as still current', () => {
    renderSheet({ ...VARIANT_320D, yearTo: null })

    expect(screen.getByText('2011+')).toBeInTheDocument()
  })

  // The four rows that identify a car are on screen from the first paint, so
  // the sheet fills in rather than growing. Displacement and fuel describe the
  // engine, and every row of the engine list prints both.
  it('prints the identifying rows with a dash before anything is picked', () => {
    renderSheet(null)

    for (const label of ['Година', 'Двигател', 'Мощност', 'KBA код']) {
      expect(valueOf(label)).toHaveTextContent('—')
    }

    expect(screen.queryByText('Обем')).not.toBeInTheDocument()
    expect(screen.queryByText('Гориво')).not.toBeInTheDocument()
  })

  // A third of variants are built with more than one engine — a Mercedes
  // E 300 CDI files OM 642.852 and OM 642.850 — and the visitor is matching
  // this against the code stamped on the block in front of them.
  it('prints every engine code filed for the variant', () => {
    renderSheet({ ...VARIANT_320D, engineCodes: ['OM 642.852', 'OM 642.850'] })

    expect(valueOf('Двигател')).toHaveTextContent('OM 642.852, OM 642.850')
  })

  it('dashes the engine row for a variant with no code filed', () => {
    renderSheet({ ...VARIANT_320D, engineCodes: [] })

    expect(valueOf('Двигател')).toHaveTextContent('—')
  })

  it('dashes the engine row for a variant cached without the field', () => {
    const cachedBeforeTheField = { ...VARIANT_320D, engineCodes: undefined }

    renderSheet(cachedBeforeTheField as unknown as VehicleVariantDto)

    expect(valueOf('Двигател')).toHaveTextContent('—')
  })

  // A variant sold under two type approvals carries both, and the visitor is
  // matching this against a registration document naming one of them.
  it('prints every type-approval number filed for the variant', () => {
    renderSheet({ ...VARIANT_320D, kbaNumbers: ['0603BLP', '0603BOF'] })

    expect(valueOf('KBA код')).toHaveTextContent('0603BLP, 0603BOF')
  })

  // 4% of live variants have none filed, which is missing data rather than a
  // failed read.
  it('dashes the type-approval row for a variant with none filed', () => {
    renderSheet({ ...VARIANT_320D, kbaNumbers: [] })

    expect(valueOf('KBA код')).toHaveTextContent('—')
  })

  // The API caches variants for a day, so a release reaching the web first is
  // answered from entries filed before the field existed. The cast is the payload
  // that really arrives: unknown has to cost a dash, not the whole dialog.
  it('dashes the type-approval row for a variant cached without the field', () => {
    const cachedBeforeTheField = { ...VARIANT_320D, kbaNumbers: undefined }

    renderSheet(cachedBeforeTheField as unknown as VehicleVariantDto)

    expect(valueOf('KBA код')).toHaveTextContent('—')
  })
})

// The strip opens the same facts over a list it cannot afford to bury, so it
// takes them across the width instead of down a column.
describe('VehicleSpecGrid', () => {
  it('carries every fact the sheet does', () => {
    render(<VehicleSpecGrid variant={VARIANT_320D} />)

    expect(valueOf('Година')).toHaveTextContent('2011–2019')
    expect(valueOf('Мощност')).toHaveTextContent('135 kW (184 к.с.)')
    expect(valueOf('Обем')).toHaveTextContent('2.0 л')
    expect(valueOf('Гориво')).toHaveTextContent('Дизел')
    expect(valueOf('Двигател')).toHaveTextContent('N47D20C')
    expect(valueOf('KBA код')).toHaveTextContent('0005BGJ')
  })

  // A column half a phone wide breaks "N47 D20 A, N47 D20 C" across three lines
  // and takes the cell beside it along, so the codes sit last and full width.
  it('sets the codes across both columns, after the measurements', () => {
    const { container } = render(<VehicleSpecGrid variant={VARIANT_320D} />)

    const labels = [...container.querySelectorAll('dt')].map((dt) => dt.textContent)
    expect(labels).toEqual(['Година', 'Мощност', 'Обем', 'Гориво', 'Двигател', 'KBA код'])

    expect(valueOf('Двигател').parentElement).toHaveClass('col-span-2')
    expect(valueOf('KBA код').parentElement).toHaveClass('col-span-2')
    expect(valueOf('Година').parentElement).not.toHaveClass('col-span-2')
  })
})
