import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { OemNumberDto } from '@vp-parts-shop/shared'
import { ArticleRowNumbers, mergePartNumbers } from './article-row-numbers'

const alternativeNumbersMock = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  alternativeNumbersQueryOptions: (articleNumber: string) => ({
    queryKey: ['catalog', 'alternative-numbers', articleNumber],
    queryFn: () => alternativeNumbersMock(articleNumber) as Promise<unknown>,
  }),
}))

function oem(
  articleNumber: string,
  manufacturerName: string | null = 'BMW',
  interchangeability: string | null = null,
): OemNumberDto {
  return { articleNumber, manufacturerName, interchangeability }
}

function renderNumbers(
  oemNumbers: OemNumberDto[] = [],
  articleNumber = 'OX 982D',
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <ArticleRowNumbers
        articleNumber={articleNumber}
        oemNumbers={oemNumbers}
      />
    </QueryClientProvider>,
  )
}

/**
 * React only reports a duplicate `key` through `console.error`, so asserting on
 * the rendered output alone would pass while React is free to drop a chip.
 */
function renderWithoutReactWarnings(ui: ReactElement) {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

  render(ui)

  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockRestore()
}

describe('ArticleRowNumbers', () => {
  beforeEach(() => {
    alternativeNumbersMock.mockReset()
    alternativeNumbersMock.mockResolvedValue([])
  })

  // The OE half rides along on the catalog response, so it must not wait on the
  // read the other half is behind.
  it('renders the OE numbers without waiting for the cross-reference read', () => {
    alternativeNumbersMock.mockReturnValue(new Promise(() => {}))

    renderNumbers([oem('13717521033')])

    expect(screen.getByText('13717521033')).toBeInTheDocument()
  })

  it('fetches the alternative numbers for the article it is mounted for', () => {
    alternativeNumbersMock.mockReturnValue(new Promise(() => {}))

    renderNumbers([], 'OF-WL7090')

    expect(alternativeNumbersMock).toHaveBeenCalledWith('OF-WL7090')
  })

  it('shows a skeleton while the alternative numbers are in flight', () => {
    alternativeNumbersMock.mockReturnValue(new Promise(() => {}))

    renderNumbers()

    expect(
      screen.getByTestId('article-row-alternative-numbers-skeleton'),
    ).toBeInTheDocument()
  })

  // Every chip names its own brand, so two numbers from one brand each carry it
  // rather than sharing a heading.
  it('renders each alternative number beside the brand that sells it', async () => {
    alternativeNumbersMock.mockResolvedValue([
      { articleNumber: 'OF-OC115', brandName: 'MANN-FILTER' },
      { articleNumber: 'OF-HU816X', brandName: 'MANN-FILTER' },
      { articleNumber: 'OF-WL7090', brandName: 'WIX Filters' },
    ])

    renderNumbers()

    expect(await screen.findByText('OF-OC115')).toBeInTheDocument()
    expect(screen.getByText('OF-HU816X')).toBeInTheDocument()
    expect(screen.getAllByText('MANN-FILTER')).toHaveLength(2)
    expect(screen.getByText('WIX Filters')).toBeInTheDocument()
  })

  it('separates the two kinds of number under their own headings', async () => {
    alternativeNumbersMock.mockResolvedValue([
      { articleNumber: 'OF-OC115', brandName: 'MANN-FILTER' },
    ])

    renderNumbers([oem('13717521033')])

    expect(await screen.findByText('OF-OC115')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'OE номера' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Номера от производители' }),
    ).toBeInTheDocument()
  })

  // A part TecDoc files no OE numbers for still has cross-references worth
  // showing; an empty heading is not one of them.
  it('omits the OE heading for a part with no OE numbers', () => {
    alternativeNumbersMock.mockReturnValue(new Promise(() => {}))

    renderNumbers([])

    expect(
      screen.queryByRole('heading', { name: 'OE номера' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Номера от производители' }),
    ).toBeInTheDocument()
  })

  it('renders each OE number beside the vehicle manufacturer that uses it', () => {
    renderNumbers([oem('11427508969', 'BMW'), oem('15208HG00D', 'NISSAN')])

    expect(screen.getByText('BMW')).toBeInTheDocument()
    expect(screen.getByText('NISSAN')).toBeInTheDocument()
  })

  it('names the manufacturer in the copy action too, for screen readers', () => {
    renderNumbers([oem('11427508969', 'BMW')])

    expect(
      screen.getByRole('button', { name: 'Копирай номер 11427508969 на BMW' }),
    ).toBeInTheDocument()
  })

  it('shows how far a number interchanges when TecDoc qualifies it', () => {
    renderNumbers([oem('11427508969', 'BMW', 'Различен обхват на доставка')])

    expect(screen.getByText('Различен обхват на доставка')).toBeInTheDocument()
  })

  // TecDoc files an OE number once per make that uses it, so a shared number
  // arrives repeated — one chip naming both makes, not two chips.
  it('renders a number shared by two makes as a single chip', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    alternativeNumbersMock.mockReturnValue(new Promise(() => {}))

    renderWithoutReactWarnings(
      <QueryClientProvider client={queryClient}>
        <ArticleRowNumbers
          articleNumber="OX 982D"
          oemNumbers={[
            oem('06J 115 403 Q', 'VW'),
            oem('06J 115 403 Q', 'AUDI'),
          ]}
        />
      </QueryClientProvider>,
    )

    expect(screen.getAllByText('06J 115 403 Q')).toHaveLength(1)
    expect(screen.getByText('VW, AUDI')).toBeInTheDocument()
  })

  it('reports an article TecDoc has no cross-references for', async () => {
    alternativeNumbersMock.mockResolvedValue([])

    renderNumbers([oem('13717521033')])

    expect(
      await screen.findByText(/Няма номера от други производители/),
    ).toBeInTheDocument()
    // The OE half is unaffected by the other half coming back empty.
    expect(screen.getByText('13717521033')).toBeInTheDocument()
  })

  it('offers a retry when the alternative-numbers read fails', async () => {
    const user = userEvent.setup()
    alternativeNumbersMock.mockRejectedValue(new Error('catalog unavailable'))

    renderNumbers()

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))
    expect(alternativeNumbersMock).toHaveBeenCalledTimes(2)
  })
})

describe('mergePartNumbers', () => {
  const number = (
    code: string,
    manufacturerName: string | null,
    note: string | null = null,
  ) => ({ code, manufacturerName, note })

  it('keeps distinct numbers apart, in TecDoc order', () => {
    expect(
      mergePartNumbers([number('A', 'BMW'), number('B', 'MINI')]),
    ).toEqual([
      { code: 'A', manufacturerNames: ['BMW'], note: null },
      { code: 'B', manufacturerNames: ['MINI'], note: null },
    ])
  })

  // The reason this merges at all: TecDoc files an OE number once per make that
  // uses it, so a VAG part arrives as the same number four times over.
  it('collapses one number filed under several makes into a single chip', () => {
    expect(
      mergePartNumbers([
        number('06J 115 403 Q', 'VW'),
        number('06J 115 403 Q', 'AUDI'),
        number('06J 115 403 Q', 'SEAT'),
      ]),
    ).toEqual([
      {
        code: '06J 115 403 Q',
        manufacturerNames: ['VW', 'AUDI', 'SEAT'],
        note: null,
      },
    ])
  })

  it('lists a make once when TecDoc repeats the same pair', () => {
    expect(
      mergePartNumbers([number('A2C', 'BMW'), number('A2C', 'BMW')]),
    ).toEqual([{ code: 'A2C', manufacturerNames: ['BMW'], note: null }])
  })

  // The note qualifies how the part interchanges with the OE one, which is a
  // fact about the number — so a merged chip keeps it rather than dropping it
  // with the make it happened to arrive under.
  it('keeps the first note across a merge', () => {
    expect(
      mergePartNumbers([
        number('A', 'VW'),
        number('A', 'AUDI', 'Различен обхват на доставка'),
      ]),
    ).toEqual([
      {
        code: 'A',
        manufacturerNames: ['VW', 'AUDI'],
        note: 'Различен обхват на доставка',
      },
    ])
  })

  // TecDoc files the marque as optional on an OE number, and an unattributed
  // number is still a real reference.
  it('keeps a number with no marque at all', () => {
    expect(mergePartNumbers([number('A', null)])).toEqual([
      { code: 'A', manufacturerNames: [], note: null },
    ])
  })

  it('returns nothing for no numbers', () => {
    expect(mergePartNumbers([])).toEqual([])
  })
})
