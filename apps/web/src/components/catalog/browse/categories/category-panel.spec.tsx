import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CategoryTreeNode } from '@/lib/catalog/category-tree'
import { CategoryPanel } from './category-panel'

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
const HOUSING = node('100262', 'корпус, маслен филтър', 12)
const LUBRICATION = node('100248', 'смазване', 131, [OIL_FILTER, HOUSING])
const ENGINE = node('100002', 'двигател', 4211, [
  LUBRICATION,
  node('100249', 'уплътнения', 806),
])

const AUDI = { vehicleId: '13074', vehicleName: 'AUDI A3 (8L1)' }

function renderPanel() {
  const onClose = jest.fn()
  render(
    <CategoryPanel
      id="category-panel-100002"
      root={ENGINE}
      scope={AUDI}
      onClose={onClose}
    />,
  )
  return onClose
}

const paramsOf = (link: HTMLElement) =>
  new URLSearchParams(link.getAttribute('href')!.split('?')[1])

describe('CategoryPanel', () => {
  it('opens on the root level and names the car the counts are for', () => {
    renderPanel()

    expect(
      screen.getByRole('heading', { name: 'двигател' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/2 групи · 4 211 артикула за/),
    ).toHaveTextContent('AUDI A3 (8L1)')
  })

  it('descends into a group and offers the way back up', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: /смазване/ }))

    expect(
      screen.getByRole('heading', { name: 'смазване' }),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(
      screen.getByRole('heading', { name: 'двигател' }),
    ).toBeInTheDocument()
  })

  // The level below `смазване` is all leaves, so nothing on it opens another
  // level and the copy has to stop promising one.
  it('calls a level of leaves groups of parts rather than subgroups', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: /смазване/ }))
    expect(screen.getByText(/2 групи части · 131 артикула за/)).toBeInTheDocument()
  })

  it('links a leaf to the search, carrying the path that reached it', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: /смазване/ }))
    const params = paramsOf(
      screen.getByRole('link', { name: /^маслен филтър/ }),
    )

    expect(params.get('vehicleId')).toBe('13074')
    expect(params.getAll('cat')).toEqual(['100002', '100248', '100259'])
    expect(params.get('catHasChildren')).toBe('false')
  })

  // A group is a listing of its own, so the panel offers it without making the
  // visitor drill to a leaf first.
  it('links the level itself to its whole listing', async () => {
    renderPanel()

    expect(
      paramsOf(screen.getByRole('link', { name: /Всички 4\s211 части/ })).getAll(
        'cat',
      ),
    ).toEqual(['100002'])

    await userEvent.click(screen.getByRole('button', { name: /смазване/ }))
    expect(
      paramsOf(screen.getByRole('link', { name: /Всички 131 части/ })).getAll('cat'),
    ).toEqual(['100002', '100248'])
  })

  it('shows a group row as a count of its subgroups', () => {
    renderPanel()

    const row = screen.getByRole('button', { name: /смазване/ })
    expect(within(row).getByText('2 подгрупи · 131')).toBeInTheDocument()
  })

  // Descending replaces the level, destroying the row that had focus — left
  // alone the caret drops to the body and a screen reader is told nothing.
  it('carries focus to the heading when the level changes', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: /смазване/ }))
    expect(screen.getByRole('heading', { name: 'смазване' })).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByRole('heading', { name: 'двигател' })).toHaveFocus()
  })

  // Opening is a disclosure, and a disclosure leaves focus on its trigger.
  it('does not take focus merely by being opened', () => {
    renderPanel()

    expect(
      screen.getByRole('heading', { name: 'двигател' }),
    ).not.toHaveFocus()
  })

  // Same rule as the grid: the drill is the catalogue, so a level shows all of
  // itself however wide it is. TecDoc files levels up to 26 across.
  it('lists every group on a level, however many there are', () => {
    const wide = Array.from({ length: 50 }, (_, index) =>
      node(`3000${index}`, `група ${index}`, 5),
    )
    render(
      <CategoryPanel
        id="category-panel-100002"
        root={node('100002', 'двигател', 4211, wide)}
        scope={AUDI}
        onClose={jest.fn()}
      />,
    )

    expect(screen.getByText(/50 групи части/)).toBeInTheDocument()
    // Every row plus the panel's own "all parts" link.
    expect(screen.getAllByRole('link')).toHaveLength(51)
  })

  it('closes', async () => {
    const onClose = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Затвори' }))
    expect(onClose).toHaveBeenCalled()
  })
})

/**
 * An article's breadcrumb names the category the part is filed under, which is
 * usually several levels below a root. The panel opens there rather than at the
 * top, so the visitor arrives where the link pointed.
 */
describe('CategoryPanel — opened on a level below the root', () => {
  function renderDeepPanel(markedCategoryId?: string) {
    render(
      <CategoryPanel
        id="category-panel-100002"
        root={ENGINE}
        scope={AUDI}
        initialPath={[LUBRICATION]}
        markedCategoryId={markedCategoryId}
        onClose={jest.fn()}
      />,
    )
  }

  it('opens on the named level with its own groups', () => {
    renderDeepPanel()

    expect(
      screen.getByRole('heading', { name: 'смазване' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /^маслен филтър/ }),
    ).toBeInTheDocument()
  })

  // Where the visitor is standing and every level back out of it — the panel's
  // own answer to "how did I get here".
  it('offers the way back up to the root', async () => {
    renderDeepPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(
      screen.getByRole('heading', { name: 'двигател' }),
    ).toBeInTheDocument()
  })

  // Arriving is not the same as drilling: the caret belongs where the visitor
  // left it, which on a fresh page is the top.
  it('does not take focus merely by opening deep', () => {
    renderDeepPanel()

    expect(screen.getByRole('heading', { name: 'смазване' })).not.toHaveFocus()
  })

  it('links a leaf with the whole path that reached it, not just this level', () => {
    renderDeepPanel()

    expect(
      paramsOf(screen.getByRole('link', { name: /^маслен филтър/ })).getAll(
        'cat',
      ),
    ).toEqual(['100002', '100248', '100259'])
  })

  it('marks the row the link named', () => {
    renderDeepPanel('100259')

    expect(
      screen.getByRole('link', { name: /^маслен филтър/ }),
    ).toHaveAttribute('aria-current', 'true')
    expect(
      screen.getByRole('link', { name: /^корпус/ }),
    ).not.toHaveAttribute('aria-current')
  })
})

describe('CategoryPanel — with no car picked', () => {
  beforeEach(() => {
    render(
      <CategoryPanel
        id="category-panel-100002"
        root={ENGINE}
        scope={null}
        onClose={jest.fn()}
      />,
    )
  })

  it('counts against the catalogue instead of naming a car', () => {
    expect(
      screen.getByText('2 групи · 4 211 артикула в каталога'),
    ).toBeInTheDocument()
  })

  it('links the level and its leaves without a vehicle', async () => {
    expect(
      paramsOf(screen.getByRole('link', { name: /Всички 4\s211 части/ })).has(
        'vehicleId',
      ),
    ).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: /смазване/ }))
    const leaf = paramsOf(screen.getByRole('link', { name: /^маслен филтър/ }))

    expect(leaf.has('vehicleId')).toBe(false)
    expect(leaf.getAll('cat')).toEqual(['100002', '100248', '100259'])
  })
})
