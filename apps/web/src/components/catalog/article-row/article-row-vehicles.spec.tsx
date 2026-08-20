import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type {
  LinkedVehicleDto,
  LinkedVehicleManufacturerDto,
  LinkedVehicleSeriesDto,
} from '@vp-parts-shop/shared'
import {
  ArticleRowVehicles,
  formatPower,
  formatYearSpan,
} from './article-row-vehicles'

const manufacturersMock = jest.fn()
const vehiclesMock = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  linkedManufacturersQueryOptions: (brandId: string, articleNumber: string) => ({
    queryKey: ['catalog', 'linked-manufacturers', brandId, articleNumber],
    queryFn: () => manufacturersMock(brandId, articleNumber) as Promise<unknown>,
  }),
  linkedVehiclesByMakeQueryOptions: (
    brandId: string,
    articleNumber: string,
    manufacturerId: string,
  ) => ({
    queryKey: [
      'catalog',
      'linked-vehicles',
      brandId,
      articleNumber,
      manufacturerId,
    ],
    queryFn: () =>
      vehiclesMock(brandId, articleNumber, manufacturerId) as Promise<unknown>,
  }),
}))

function make(
  overrides: Partial<LinkedVehicleManufacturerDto> = {},
): LinkedVehicleManufacturerDto {
  return { manufacturerId: '5', name: 'BMW', ...overrides }
}

function vehicle(
  overrides: Partial<LinkedVehicleDto> & Pick<LinkedVehicleDto, 'vehicleId'>,
): LinkedVehicleDto {
  return {
    name: '320d',
    yearFrom: 2005,
    yearTo: 2011,
    powerKw: 130,
    powerHp: 177,
    fuelType: 'Diesel',
    engineCodes: ['N47 D20 C'],
    ...overrides,
  }
}

function series(
  overrides: Partial<LinkedVehicleSeriesDto> = {},
): LinkedVehicleSeriesDto {
  return {
    seriesId: '41232',
    manufacturerId: '5',
    name: '3 Series (E90)',
    vehicles: [vehicle({ vehicleId: '1' })],
    ...overrides,
  }
}

const BMW = make()
const MERCEDES = make({ manufacturerId: '16', name: 'MERCEDES-BENZ' })
const E90 = series()
const E87 = series({
  seriesId: '41233',
  name: '1 Series (E87)',
  vehicles: [vehicle({ vehicleId: '2', name: '120d' })],
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

async function openMake(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^BMW/ }))
}

describe('ArticleRowVehicles', () => {
  beforeEach(() => {
    manufacturersMock.mockReset()
    vehiclesMock.mockReset().mockResolvedValue([E90, E87])
  })

  // Brand and number both: linkages are per part, and two brands can file one
  // number — a number-only read can list another company's vehicles.
  it('fetches the makes for the exact article it is mounted for', () => {
    manufacturersMock.mockReturnValue(new Promise(() => {}))

    renderVehicles('OF-WL7090', '268')

    expect(manufacturersMock).toHaveBeenCalledWith('268', 'OF-WL7090')
  })

  it('shows a skeleton while the read is in flight', () => {
    manufacturersMock.mockReturnValue(new Promise(() => {}))

    renderVehicles()

    expect(
      screen.getByTestId('article-row-vehicles-skeleton'),
    ).toBeInTheDocument()
  })

  // The whole point of the design: a part fits thousands of modifications, so
  // no vehicle may be read until someone asks for a make.
  it('reads no vehicles until a make is opened', async () => {
    manufacturersMock.mockResolvedValue([BMW, MERCEDES])

    renderVehicles()

    expect(await screen.findByText('BMW')).toBeInTheDocument()
    expect(screen.getByText('MERCEDES-BENZ')).toBeInTheDocument()
    expect(vehiclesMock).not.toHaveBeenCalled()
  })

  it('reads the tree of a make when it is opened', async () => {
    const user = userEvent.setup()
    manufacturersMock.mockResolvedValue([BMW, MERCEDES])

    renderVehicles()
    await openMake(user)

    expect(vehiclesMock).toHaveBeenCalledWith('72', 'OF-OC115', '5')
    expect(await screen.findByText('3 Series (E90)')).toBeInTheDocument()
    expect(screen.getByText('1 Series (E87)')).toBeInTheDocument()
  })

  // The vehicles came down with the make, so opening a series is local state —
  // no second read and no spinner.
  it('shows a series’ modifications without a further read', async () => {
    const user = userEvent.setup()
    manufacturersMock.mockResolvedValue([BMW])

    renderVehicles()
    await openMake(user)
    await user.click(await screen.findByRole('button', { name: /3 Series/ }))

    expect(await screen.findByText('320d')).toBeInTheDocument()
    expect(vehiclesMock).toHaveBeenCalledTimes(1)
  })

  it('states how many modifications sit behind a series', async () => {
    const user = userEvent.setup()
    manufacturersMock.mockResolvedValue([BMW])
    vehiclesMock.mockResolvedValue([
      series({
        vehicles: [
          vehicle({ vehicleId: '1' }),
          vehicle({ vehicleId: '2', name: '318d' }),
        ],
      }),
      E87,
    ])

    renderVehicles()
    await openMake(user)

    const seriesRow = await screen.findByRole('button', { name: /3 Series/ })
    expect(within(seriesRow).getByText('2')).toBeInTheDocument()
  })

  // Collapsing the only choice on offer just costs a click.
  it('opens a make’s only series straight away', async () => {
    const user = userEvent.setup()
    manufacturersMock.mockResolvedValue([BMW])
    vehiclesMock.mockResolvedValue([E90])

    renderVehicles()
    await openMake(user)

    expect(await screen.findByText('320d')).toBeInTheDocument()
  })

  it('leaves every series collapsed when there is a choice', async () => {
    const user = userEvent.setup()
    manufacturersMock.mockResolvedValue([BMW])

    renderVehicles()
    await openMake(user)

    expect(await screen.findByText('3 Series (E90)')).toBeInTheDocument()
    expect(screen.queryByText('320d')).not.toBeInTheDocument()
  })

  it('collapses a make, hiding its series', async () => {
    const user = userEvent.setup()
    manufacturersMock.mockResolvedValue([BMW])

    renderVehicles()
    const makeRow = await screen.findByRole('button', { name: /^BMW/ })
    await user.click(makeRow)
    expect(await screen.findByText('3 Series (E90)')).toBeInTheDocument()

    await user.click(makeRow)
    expect(screen.queryByText('3 Series (E90)')).not.toBeInTheDocument()
  })

  it('renders the full modification detail in the table', async () => {
    const user = userEvent.setup()
    manufacturersMock.mockResolvedValue([BMW])
    vehiclesMock.mockResolvedValue([E90])

    renderVehicles()
    await openMake(user)

    const row = (await screen.findByRole('rowheader', { name: '320d' })).closest(
      'tr',
    )!
    expect(within(row).getByText('130 kW / 177 hp')).toBeInTheDocument()
    expect(within(row).getByText('2005–2011')).toBeInTheDocument()
    expect(within(row).getByText('Diesel')).toBeInTheDocument()
    expect(within(row).getByText('N47 D20 C')).toBeInTheDocument()
  })

  // A mechanic matching the code stamped on the block against a shortened list
  // would conclude the part does not fit, so every code on file is shown.
  it('lists every engine code filed for a modification', async () => {
    const user = userEvent.setup()
    manufacturersMock.mockResolvedValue([BMW])
    vehiclesMock.mockResolvedValue([
      series({
        vehicles: [
          vehicle({ vehicleId: '1', engineCodes: ['OM 651 DE22', '651.911'] }),
        ],
      }),
    ])

    renderVehicles()
    await openMake(user)

    expect(await screen.findByText('OM 651 DE22, 651.911')).toBeInTheDocument()
  })

  // TecDoc omits what it has not catalogued; the row still belongs in the table.
  it('dashes out the fields TecDoc left empty', async () => {
    const user = userEvent.setup()
    manufacturersMock.mockResolvedValue([BMW])
    vehiclesMock.mockResolvedValue([
      series({
        vehicles: [
          vehicle({
            vehicleId: '9',
            powerKw: null,
            powerHp: null,
            fuelType: null,
            engineCodes: [],
          }),
        ],
      }),
    ])

    renderVehicles()
    await openMake(user)

    const row = (await screen.findByRole('rowheader', { name: '320d' })).closest(
      'tr',
    )!
    expect(within(row).getAllByText('—')).toHaveLength(3)
  })

  it('reports an article with no catalogued linkages', async () => {
    manufacturersMock.mockResolvedValue([])

    renderVehicles()

    expect(
      await screen.findByText(/Няма данни за приложими автомобили/),
    ).toBeInTheDocument()
  })

  it('offers a retry when the make read fails', async () => {
    const user = userEvent.setup()
    manufacturersMock.mockRejectedValue(new Error('catalog unavailable'))

    renderVehicles()

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))
    expect(manufacturersMock).toHaveBeenCalledTimes(2)
  })

  // The make came from the linkage read, so no vehicles behind it is a
  // contradiction — but it used to render as an empty box.
  it('reports a make that hydrates to no models', async () => {
    const user = userEvent.setup()
    manufacturersMock.mockResolvedValue([BMW])
    vehiclesMock.mockResolvedValue([])

    renderVehicles()
    await openMake(user)

    expect(
      await screen.findByText(/Няма данни за моделите на тази марка/),
    ).toBeInTheDocument()
  })

  // TecDoc leaves `modId` off a sparse vehicle, and every such row lands in one
  // group that would otherwise carry no heading at all.
  it('names the group holding vehicles TecDoc filed no series for', async () => {
    const user = userEvent.setup()
    manufacturersMock.mockResolvedValue([BMW])
    vehiclesMock.mockResolvedValue([series({ seriesId: '', name: '' })])

    renderVehicles()
    await openMake(user)

    expect(
      await screen.findByRole('button', { name: /Други модели/ }),
    ).toBeInTheDocument()
  })

  // A failed read must not take the make list down with it: it is still on
  // screen and still openable.
  it('reports a failed vehicle read inside the make that failed', async () => {
    const user = userEvent.setup()
    manufacturersMock.mockResolvedValue([BMW])
    vehiclesMock.mockRejectedValue(new Error('catalog unavailable'))

    renderVehicles()
    await openMake(user)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('BMW')).toBeInTheDocument()
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
