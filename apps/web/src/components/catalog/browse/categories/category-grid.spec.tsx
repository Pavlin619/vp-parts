import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CategoryTreeNode } from '@/lib/catalog/categories/category-tree'
import { CategoryGrid } from './category-grid'

function node(
  id: string,
  name: string,
  children: CategoryTreeNode[] = [],
): CategoryTreeNode {
  return {
    category: { id, name, parentId: null, articleCount: 10, sortNo: 1 },
    children,
  }
}

/**
 * Six roots against the four-column default: two rows, the second short. Two of
 * them run three levels deep, which is what makes the drill reachable.
 */
const ROOTS = [
  node('1', 'каросерия', [node('1-1', 'калник')]),
  node('2', 'двигател', [
    node('2-1', 'смазване', [node('2-1-1', 'маслен филтър')]),
  ]),
  node('3', 'филтър', [node('3-1', 'въздушен филтър')]),
  node('4', 'ремъчно задвижване', [node('4-1', 'ремък')]),
  node('5', 'охлаждане', [node('5-1', 'радиатор', [node('5-1-1', 'перка')])]),
  node('6', 'спирачна уредба', [node('6-1', 'накладки')]),
]

/**
 * Lets a test drive the observer the grid measures its columns with. The shared
 * setup stubs it as a no-op, which pins every test to the initial four columns.
 */
let resizeCallbacks: ResizeObserverCallback[] = []

beforeEach(() => {
  resizeCallbacks = []

  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      resizeCallbacks.push(callback)
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const resizeTo = (width: number) =>
  act(() => {
    for (const callback of resizeCallbacks) {
      callback(
        [{ contentRect: { width } } as ResizeObserverEntry],
        {} as ResizeObserver,
      )
    }
  })

function renderGrid() {
  return render(
    <CategoryGrid
      roots={ROOTS}
      scope={{ vehicleId: '13074', vehicleName: 'AUDI A3' }}
    />,
  )
}

const panelFor = (name: string) =>
  screen.getByRole('region', { name: `Групи в ${name}` })

/** A card on the grid, as opposed to a same-named button inside an open panel. */
const cardFor = (name: string) =>
  screen
    .getAllByRole('button', { name: new RegExp(name) })
    .find((button) => !button.closest('section'))!

const openCard = (name: string) => userEvent.click(cardFor(name))

describe('CategoryGrid', () => {
  it('renders every root', () => {
    renderGrid()

    ROOTS.forEach((root) =>
      expect(cardFor(root.category.name)).toBeInTheDocument(),
    )
  })

  // A panel dropped straight after its card would break the row it sits in, so
  // it is placed after the last card of that row instead.
  it('places the open panel after the whole row its card is in', async () => {
    const { container } = renderGrid()

    await openCard('двигател')

    const cells = Array.from(container.firstElementChild!.children)

    expect(cells.indexOf(panelFor('двигател'))).toBe(4)
  })

  it('opens one root at a time', async () => {
    renderGrid()

    await openCard('двигател')
    await openCard('филтър')

    expect(panelFor('филтър')).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Групи в двигател' }),
    ).not.toBeInTheDocument()
  })

  it('closes the panel by clicking its card again', async () => {
    renderGrid()

    await openCard('двигател')
    await openCard('двигател')

    expect(
      screen.queryByRole('region', { name: 'Групи в двигател' }),
    ).not.toBeInTheDocument()
  })

  // Each panel keeps its own drill, so re-opening a root must not restore the
  // level the previous one was left on.
  it('starts a newly opened root at its top level', async () => {
    renderGrid()

    await openCard('двигател')
    await userEvent.click(
      within(panelFor('двигател')).getByRole('button', { name: /смазване/ }),
    )
    await openCard('филтър')
    await openCard('двигател')

    expect(
      screen.getByRole('heading', { name: 'двигател' }),
    ).toBeInTheDocument()
  })

  /**
   * Narrowing re-chunks the rows, which moves the panel to a different position
   * in the grid. It must travel rather than be rebuilt: a rebuilt panel loses
   * the level it is drilled to and drops the visitor back at the root.
   */
  it('keeps the open panel on its level through a column change', async () => {
    renderGrid()

    await openCard('охлаждане')
    await userEvent.click(
      within(panelFor('охлаждане')).getByRole('button', { name: /радиатор/ }),
    )
    expect(screen.getByRole('heading', { name: 'радиатор' })).toBeInTheDocument()

    resizeTo(700)

    expect(screen.getByRole('heading', { name: 'радиатор' })).toBeInTheDocument()
  })

  it('re-lays the cards when the grid narrows', async () => {
    const { container } = renderGrid()

    resizeTo(700)
    await openCard('ремъчно задвижване')

    // Three columns puts the fourth root at the head of the second row, so its
    // panel follows the sixth card rather than the fourth.
    const cells = Array.from(container.firstElementChild!.children)

    expect(cells.indexOf(panelFor('ремъчно задвижване'))).toBe(6)
  })
})
