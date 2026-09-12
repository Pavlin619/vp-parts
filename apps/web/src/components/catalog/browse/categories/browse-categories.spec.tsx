import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AssemblyGroupDto } from '@vp-parts-shop/shared'
import type { SelectedVehicle } from '@/hooks/use-vehicle-context'
import { BrowseCategories } from './browse-categories'

const getCategoriesMock = jest.fn()

jest.mock('@/lib/api/catalog', () => ({
  categoriesQueryOptions: (vehicleId: string) => ({
    queryKey: ['catalog', 'categories', vehicleId],
    queryFn: () => getCategoriesMock(vehicleId) as Promise<AssemblyGroupDto[]>,
  }),
}))

function group(
  id: string,
  name: string,
  parentId: string | null,
  sortNo: number,
): AssemblyGroupDto {
  return { id, name, parentId, articleCount: 100, sortNo }
}

/** Flat and depth first, the shape the API serves. */
const TREE: AssemblyGroupDto[] = [
  group('100005', 'филтър', null, 3),
  group('100259', 'маслен филтър', '100005', 1),
  group('100006', 'спирачна уредба', null, 13),
  group('100270', 'накладки', '100006', 1),
]

const AUDI: SelectedVehicle = {
  vehicleId: '13074',
  manufacturerId: '5',
  seriesId: '2439',
  manufacturerName: 'AUDI',
  seriesName: 'A3 (8L1)',
  variantName: '1.8 T',
  engineCodes: ['AGU'],
  powerKw: 110,
  powerHp: 150,
  yearFrom: 1996,
  yearTo: 2003,
}

function renderCategories(scopedCategoryId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowseCategories vehicle={AUDI} scopedCategoryId={scopedCategoryId} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  getCategoriesMock.mockResolvedValue(TREE)
})

describe('BrowseCategories', () => {
  it('asks for the tree of the selected car', async () => {
    renderCategories()

    await screen.findByRole('button', { name: /филтър/ })
    expect(getCategoriesMock).toHaveBeenCalledWith('13074')
  })

  it('skeletons the grid while the tree loads', () => {
    renderCategories()

    expect(
      screen.getByLabelText('Зареждане на категориите'),
    ).toBeInTheDocument()
  })

  // The roots overlap — an article is filed under several — so their counts
  // must never be added up into a total for the car.
  it('counts the roots and names the car, and totals nothing else', async () => {
    renderCategories()

    const summary = await screen.findByText(/2 категории с части за/)
    expect(summary).toHaveTextContent('AUDI A3 (8L1)')
  })

  // A car whose tree holds a single root is ordinary, and `1 категории` is not
  // a sentence.
  it('says the count in the singular when there is one root', async () => {
    getCategoriesMock.mockResolvedValue([group('100005', 'филтър', null, 3)])
    renderCategories()

    expect(
      await screen.findByText(/1 категория с части за/),
    ).toBeInTheDocument()
  })

  // The whole tree arrives at once; the grid opens one level of it.
  it('puts a card on the grid for each root and none for their children', async () => {
    renderCategories()

    await screen.findByRole('button', { name: /филтър/ })
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('replaces the grid with the matches while a term is typed', async () => {
    renderCategories()
    await screen.findByRole('button', { name: /филтър/ })

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Търси категория' }),
      'наклад',
    )

    expect(screen.getByText('1 съвпадение за „наклад“')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /спирачна уредба/ }),
    ).not.toBeInTheDocument()
  })

  it('returns to the grid when the term is cleared', async () => {
    renderCategories()
    await screen.findByRole('button', { name: /филтър/ })

    const input = screen.getByRole('textbox', { name: 'Търси категория' })
    await userEvent.type(input, 'наклад')
    await userEvent.click(screen.getByRole('button', { name: 'Изчисти' }))

    expect(input).toHaveValue('')
    expect(
      screen.getByRole('button', { name: /спирачна уредба/ }),
    ).toBeInTheDocument()
  })

  // A single letter matches most of a real tree, so the first keystroke of
  // every search would otherwise answer with a page of noise.
  it('waits for a second character before it searches', async () => {
    renderCategories()
    await screen.findByRole('button', { name: /филтър/ })

    const input = screen.getByRole('textbox', { name: 'Търси категория' })
    await userEvent.type(input, 'н')

    expect(screen.getByText(/Въведете поне 2 знака/)).toBeInTheDocument()

    await userEvent.type(input, 'а')

    expect(screen.getByText(/съвпадени/)).toBeInTheDocument()
  })

  /**
   * The finder's cap is the finder's alone. The grid is the catalogue itself,
   * and a root missing from it is a category the visitor cannot reach at all.
   */
  it('puts every root on the grid, past any search limit', async () => {
    const wide = Array.from({ length: 60 }, (_, index) =>
      group(`2000${index}`, `категория ${index}`, null, index),
    )
    getCategoriesMock.mockResolvedValue(wide)
    renderCategories()

    await screen.findByText(/60 категории с части за/)

    expect(screen.getAllByRole('link')).toHaveLength(60)
  })

  it('offers a retry when the tree fails to load', async () => {
    getCategoriesMock.mockRejectedValue(new Error('502'))
    renderCategories()

    expect(
      await screen.findByText('Категориите не се заредиха.'),
    ).toBeInTheDocument()

    getCategoriesMock.mockResolvedValue(TREE)
    await userEvent.click(screen.getByRole('button', { name: 'Опитай отново' }))

    await waitFor(() => expect(getCategoriesMock).toHaveBeenCalledTimes(2))
  })

  it('says so when TecDoc files no categories for the car', async () => {
    getCategoriesMock.mockResolvedValue([])
    renderCategories()

    expect(
      await screen.findByText(/не връща категории за този автомобил/),
    ).toBeInTheDocument()
  })
})

/**
 * A homepage tile hands over a root id and nothing else. The narrowed page is
 * the same screen — same card, same panel, same finder — with the grid cut down
 * to the one root and the panel already open.
 */
describe('BrowseCategories — narrowed to one category', () => {
  it('shows that category and none of the others', async () => {
    renderCategories('100006')

    expect(
      await screen.findByRole('button', { name: /спирачна уредба/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /филтър/ }),
    ).not.toBeInTheDocument()
  })

  it('titles the page with the category and counts what is inside it', async () => {
    renderCategories('100006')

    expect(
      await screen.findByRole('heading', { name: 'спирачна уредба', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.getByText(/1 група · 100 артикула/)).toBeInTheDocument()
  })

  it('opens the level below it without a click', async () => {
    renderCategories('100006')

    // The panel's own heading, which is only rendered while it is open.
    expect(
      await screen.findByRole('heading', { name: 'спирачна уредба', level: 3 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /накладки/ }),
    ).toBeInTheDocument()
  })

  it('offers the way back to the whole catalogue', async () => {
    renderCategories('100006')

    await screen.findByRole('button', { name: /спирачна уредба/ })
    expect(
      screen.getByRole('link', { name: 'Всички категории' }),
    ).toHaveAttribute('href', '/catalog')
    expect(screen.getByText('2 категории в каталога')).toBeInTheDocument()
  })

  // Searching from inside a category is searching that category — the rest of
  // the tree is not what the visitor is looking at.
  it('keeps the finder inside the narrowing', async () => {
    renderCategories('100006')
    await screen.findByRole('button', { name: /спирачна уредба/ })

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Търси категория' }),
      'филт',
    )

    expect(screen.getByText(/Нищо за „филт“/)).toBeInTheDocument()
  })

  // A stale link, or a category this model takes no parts from. The scope bar
  // above it is the way on, so the page is not a dead end.
  it('says so when the car has no such category', async () => {
    renderCategories('999999')

    expect(
      await screen.findByText(/Тази категория няма части за AUDI A3/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Всички категории' }),
    ).toBeInTheDocument()
  })
})
