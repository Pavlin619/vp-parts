import { render, screen, within } from '@testing-library/react'
import type { CategoryMatch } from '@/lib/catalog/category-search'
import type { CategoryTreeNode } from '@/lib/catalog/category-tree'
import { CategorySearchResults } from './category-search-results'

function node(
  id: string,
  name: string,
  articleCount: number,
  children: CategoryTreeNode[] = [],
): CategoryTreeNode {
  return {
    category: { id, name, parentId: null, articleCount, sortNo: 1 },
    children,
  }
}

const OIL_FILTER = node('100259', 'маслен филтър', 119)
const FILTERS = node('100005', 'филтър', 788, [OIL_FILTER])
const CABIN_UNDER_HEATING = node('100346', 'филтър купе', 262)
const HEATING = node('100241', 'отопление/вентилация', 900, [
  CABIN_UNDER_HEATING,
])

const MATCHES: CategoryMatch[] = [
  { node: FILTERS, path: [FILTERS] },
  { node: OIL_FILTER, path: [FILTERS, OIL_FILTER] },
  { node: CABIN_UNDER_HEATING, path: [HEATING, CABIN_UNDER_HEATING] },
]

const renderResults = (
  matches = MATCHES,
  term = 'филтър',
  total = matches.length,
) =>
  render(
    <CategorySearchResults
      matches={matches}
      total={total}
      term={term}
      vehicleId="13074"
    />,
  )

describe('CategorySearchResults', () => {
  it('counts the hits and echoes the term', () => {
    renderResults()

    expect(screen.getByText('3 съвпадения за „филтър“')).toBeInTheDocument()
  })

  it('counts a lone hit in the singular', () => {
    renderResults([MATCHES[0]])

    expect(screen.getByText('1 съвпадение за „филтър“')).toBeInTheDocument()
  })

  // Reporting the shown count as the total is what made a truncated list look
  // like the whole answer.
  it('says the list is only the first page when it was cut short', () => {
    renderResults(MATCHES, 'части', 118)

    expect(
      screen.getByText('Първите 3 от 118 съвпадения за „части“'),
    ).toBeInTheDocument()
  })

  it('links every hit to the search, carrying its whole path', () => {
    renderResults()

    const link = screen.getByRole('link', { name: /^маслен филтър/ })
    const params = new URLSearchParams(link.getAttribute('href')!.split('?')[1])

    expect(params.get('vehicleId')).toBe('13074')
    expect(params.getAll('cat')).toEqual(['100005', '100259'])
  })

  // A group is a listing of its own, so it is a destination and not a dead row.
  it('links a group too, and marks it as one', () => {
    renderResults()

    const link = screen.getByRole('link', { name: /^филтър Основна категория/ })

    expect(within(link).getByText('група')).toBeInTheDocument()
    expect(link).toHaveAttribute('href', expect.stringContaining('cat=100005'))
  })

  // The same label sits at two node ids under two parents, so the trail is what
  // tells the two rows apart.
  it('shows where a hit sits, and says so for a root', () => {
    renderResults()

    expect(screen.getByText('отопление/вентилация')).toBeInTheDocument()
    expect(screen.getByText('Основна категория')).toBeInTheDocument()
  })

  it('highlights the matched part of the name', () => {
    const { container } = renderResults()

    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(3)
    expect(marks[0]).toHaveTextContent('филтър')
  })

  it('offers a way out when nothing matched', () => {
    renderResults([], 'накладки')

    expect(screen.getByText('Нищо за „накладки“')).toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
