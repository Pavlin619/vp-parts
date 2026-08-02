import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { LinkedVehicleDto } from '@vp-parts-shop/shared'
import {
  ArticleRowVehicles,
  formatPower,
  formatYearSpan,
  groupLinkedVehicles,
} from './article-row-vehicles'

const linkedVehiclesMock = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  linkedVehiclesQueryOptions: (brandId: string, articleNumber: string) => ({
    queryKey: ['catalog', 'linked-vehicles', brandId, articleNumber],
    queryFn: () =>
      linkedVehiclesMock(brandId, articleNumber) as Promise<unknown>,
  }),
}))

function vehicle(
  overrides: Partial<LinkedVehicleDto> & Pick<LinkedVehicleDto, 'vehicleId'>,
): LinkedVehicleDto {
  return {
    manufacturerName: 'BMW',
    modelSeriesName: '3 Series (E90)',
    name: '320d',
    yearFrom: 2005,
    yearTo: 2011,
    powerKw: 130,
    powerHp: 177,
    fuelType: 'Diesel',
    engineCode: 'N47 D20 C',
    ...overrides,
  }
}

const BMW_320D = vehicle({ vehicleId: '1' })
const BMW_318D = vehicle({ vehicleId: '2', name: '318d', powerHp: 143 })
const BMW_120D = vehicle({
  vehicleId: '3',
  modelSeriesName: '1 Series (E87)',
  name: '120d',
})
const MERCEDES_C220 = vehicle({
  vehicleId: '4',
  manufacturerName: 'MERCEDES-BENZ',
  modelSeriesName: 'C-Class (W204)',
  name: 'C 220 CDI',
})

function renderVehicles(articleNumber = 'OF-OC115', brandId = '72') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <ArticleRowVehicles brandId={brandId} articleNumber={articleNumber} />
    </QueryClientProvider>,
  )
}

describe('ArticleRowVehicles', () => {
  beforeEach(() => {
    linkedVehiclesMock.mockReset()
  })

  // Brand and number both: linkages are per part, and two brands can file one
  // number — a number-only read can list another company's vehicles.
  it('fetches the vehicles for the exact article it is mounted for', () => {
    linkedVehiclesMock.mockReturnValue(new Promise(() => {}))

    renderVehicles('OF-WL7090', '268')

    expect(linkedVehiclesMock).toHaveBeenCalledWith('268', 'OF-WL7090')
  })

  it('shows a skeleton while the read is in flight', () => {
    linkedVehiclesMock.mockReturnValue(new Promise(() => {}))

    renderVehicles()

    expect(
      screen.getByTestId('article-row-vehicles-skeleton'),
    ).toBeInTheDocument()
  })

  it('opens on the first make and its first series', async () => {
    linkedVehiclesMock.mockResolvedValue([BMW_320D, BMW_120D, MERCEDES_C220])

    renderVehicles()

    // The first series' table is on screen…
    expect(await screen.findByText('320d')).toBeInTheDocument()
    // …while the second series of the same make and the second make are not.
    expect(screen.queryByText('120d')).not.toBeInTheDocument()
    expect(screen.queryByText('C 220 CDI')).not.toBeInTheDocument()
    expect(screen.getByText('MERCEDES-BENZ')).toBeInTheDocument()
  })

  it('reveals a series table when its row is opened', async () => {
    const user = userEvent.setup()
    linkedVehiclesMock.mockResolvedValue([BMW_320D, BMW_120D])

    renderVehicles()
    await user.click(await screen.findByRole('button', { name: /1 Series/ }))

    expect(screen.getByText('120d')).toBeInTheDocument()
  })

  it('collapses a make, hiding its series', async () => {
    const user = userEvent.setup()
    linkedVehiclesMock.mockResolvedValue([BMW_320D, MERCEDES_C220])

    renderVehicles()
    await user.click(await screen.findByRole('button', { name: /^BMW/ }))

    expect(screen.queryByText('320d')).not.toBeInTheDocument()
    expect(screen.queryByText('3 Series (E90)')).not.toBeInTheDocument()
  })

  it('counts the series and modifications on the make row', async () => {
    linkedVehiclesMock.mockResolvedValue([BMW_320D, BMW_318D, BMW_120D])

    renderVehicles()

    expect(
      await screen.findByText('2 модела · 3 модификации'),
    ).toBeInTheDocument()
  })

  it('renders the full modification detail in the table', async () => {
    linkedVehiclesMock.mockResolvedValue([BMW_320D])

    renderVehicles()

    const row = (await screen.findByRole('rowheader', { name: '320d' }))
      .closest('tr')!
    expect(within(row).getByText('130 kW / 177 hp')).toBeInTheDocument()
    expect(within(row).getByText('2005–2011')).toBeInTheDocument()
    expect(within(row).getByText('Diesel')).toBeInTheDocument()
    expect(within(row).getByText('N47 D20 C')).toBeInTheDocument()
  })

  // TecDoc omits what it has not catalogued; the row still belongs in the table.
  it('dashes out the fields TecDoc left empty', async () => {
    linkedVehiclesMock.mockResolvedValue([
      vehicle({
        vehicleId: '9',
        powerKw: null,
        powerHp: null,
        fuelType: null,
        engineCode: null,
      }),
    ])

    renderVehicles()

    const row = (await screen.findByRole('rowheader', { name: '320d' }))
      .closest('tr')!
    expect(within(row).getAllByText('—')).toHaveLength(3)
  })

  it('reports an article with no catalogued linkages', async () => {
    linkedVehiclesMock.mockResolvedValue([])

    renderVehicles()

    expect(
      await screen.findByText(/Няма данни за приложими автомобили/),
    ).toBeInTheDocument()
  })

  it('offers a retry when the read fails', async () => {
    const user = userEvent.setup()
    linkedVehiclesMock.mockRejectedValue(new Error('catalog unavailable'))

    renderVehicles()

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))
    expect(linkedVehiclesMock).toHaveBeenCalledTimes(2)
  })
})

describe('groupLinkedVehicles', () => {
  it('nests make → series → modification, keeping TecDoc order', () => {
    const groups = groupLinkedVehicles([
      BMW_320D,
      MERCEDES_C220,
      BMW_120D,
      BMW_318D,
    ])

    expect(groups.map((group) => group.manufacturerName)).toEqual([
      'BMW',
      'MERCEDES-BENZ',
    ])
    expect(groups[0].series.map((series) => series.modelSeriesName)).toEqual([
      '3 Series (E90)',
      '1 Series (E87)',
    ])
    expect(groups[0].series[0].vehicles).toEqual([BMW_320D, BMW_318D])
    expect(groups[0].vehicleCount).toBe(3)
  })

  it('spans a series across the modifications it lists', () => {
    const groups = groupLinkedVehicles([
      vehicle({ vehicleId: '1', yearFrom: 2007, yearTo: 2011 }),
      vehicle({ vehicleId: '2', yearFrom: 2005, yearTo: 2010 }),
    ])

    expect(groups[0].series[0]).toMatchObject({ yearFrom: 2005, yearTo: 2011 })
  })

  // One modification still in production leaves the whole series open-ended,
  // so the span must not close at the newest dated one.
  it('leaves a series open-ended while any modification is still built', () => {
    const groups = groupLinkedVehicles([
      vehicle({ vehicleId: '1', yearFrom: 2005, yearTo: 2011 }),
      vehicle({ vehicleId: '2', yearFrom: 2012, yearTo: null }),
    ])

    expect(groups[0].series[0]).toMatchObject({ yearFrom: 2005, yearTo: null })
  })

  it('returns no groups for no vehicles', () => {
    expect(groupLinkedVehicles([])).toEqual([])
  })
})

describe('formatYearSpan', () => {
  it.each([
    [2005, 2011, '2005–2011'],
    [2015, null, '2015–'],
    [null, null, null],
  ])('formats %s–%s as %s', (from, to, expected) => {
    expect(formatYearSpan(from, to)).toBe(expected)
  })
})

describe('formatPower', () => {
  it.each([
    [130, 177, '130 kW / 177 hp'],
    [130, null, '130 kW'],
    [null, 177, '177 hp'],
    [null, null, null],
  ])('formats %s kW / %s hp as %s', (kw, hp, expected) => {
    expect(formatPower(kw, hp)).toBe(expected)
  })
})
