import { render, screen } from '@testing-library/react'
import type { ManufacturerDto, ModelSeriesDto, VehicleVariantDto } from '@vp-parts-shop/shared'
import { VehicleSelectionList } from './selection-list'
import type { Step } from './use-vehicle-selector'

const BMW: ManufacturerDto = { id: '16', name: 'BMW', isPopular: true }
const SERIES_3: ModelSeriesDto = {
  id: 's3',
  manufacturerId: '16',
  name: '3 Series',
  yearFrom: 2011,
  yearTo: 2019,
}
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
  imageUrl: null,
  kbaNumbers: ['0005BGJ'],
}

interface Overrides {
  step?: Step
  search?: string
  isLoading?: boolean
  filteredManufacturers?: ManufacturerDto[]
  filteredSeries?: ModelSeriesDto[]
  filteredVariants?: VehicleVariantDto[]
}

function renderList(overrides: Overrides = {}) {
  return render(
    <VehicleSelectionList
      step={0}
      search=""
      onSearchChange={jest.fn()}
      isLoading={false}
      filteredManufacturers={[BMW]}
      filteredSeries={[SERIES_3]}
      filteredVariants={[VARIANT_320D]}
      pendingVariantId={undefined}
      onSelectMake={jest.fn()}
      onSelectSeries={jest.fn()}
      onSelectVariant={jest.fn()}
      {...overrides}
    />,
  )
}

// Without this the panel is a blank white area under a search box, which reads
// as a step still loading rather than as a query that matched nothing.
describe('VehicleSelectionList — nothing to list', () => {
  it('names the query back when a search matches nothing', () => {
    renderList({ step: 2, search: 'N54', filteredVariants: [] })

    expect(screen.getByRole('status')).toHaveTextContent('Няма резултати за „N54“')
  })

  it('trims the query it names back', () => {
    renderList({ step: 0, search: '  zzz  ', filteredManufacturers: [] })

    expect(screen.getByRole('status')).toHaveTextContent('Няма резултати за „zzz“')
  })

  it.each([
    [0 as Step, 'Няма налични марки', { filteredManufacturers: [] }],
    [1 as Step, 'Няма модели за тази марка', { filteredSeries: [] }],
    [2 as Step, 'Няма двигатели за този модел', { filteredVariants: [] }],
  ])('tells step %i apart when nothing was typed', (step, message, empty) => {
    renderList({ step, search: '', ...empty })

    expect(screen.getByRole('status')).toHaveTextContent(message)
  })

  // A step still fetching already says so through the skeleton, and saying both
  // would flash "no results" over every load.
  it('stays silent while the step is still loading', () => {
    renderList({ step: 1, search: 'x', isLoading: true, filteredSeries: [] })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Зарежда се...')).toBeInTheDocument()
  })

  it('says nothing while the step has rows', () => {
    renderList({ step: 2 })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('VehicleSelectionList — the engine rows', () => {
  // A third of variants are built with more than one engine, and the search
  // matches over all of them — a row truncated to the first would hide what it
  // matched on.
  it('prints every engine code the variant carries', () => {
    renderList({
      step: 2,
      filteredVariants: [
        { ...VARIANT_320D, engineCodes: ['OM 642.852', 'OM 642.850'] },
      ],
    })

    expect(screen.getByText('OM 642.852, OM 642.850')).toBeInTheDocument()
  })

  it('renders a variant with no engine code filed', () => {
    renderList({ step: 2, filteredVariants: [{ ...VARIANT_320D, engineCodes: [] }] })

    expect(screen.getByText('320 d')).toBeInTheDocument()
  })
})
