import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CategoryTreeNode } from '@/lib/catalog/category-tree'
import { CategoryPanelRow } from './category-panel-row'

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

const ENGINE = node('100002', 'двигател', 4211)
const LUBRICATION = node('100248', 'смазване', 131, [
  node('100259', 'маслен филтър', 119),
  node('100262', 'корпус', 12),
])
const OIL_FILTER = node('100259', 'маслен филтър', 119)

function renderRow(node: CategoryTreeNode) {
  const onDrill = jest.fn()

  render(
    <ul>
      <CategoryPanelRow
        node={node}
        ancestors={[ENGINE]}
        vehicleId="13074"
        onDrill={onDrill}
      />
    </ul>,
  )

  return onDrill
}

describe('CategoryPanelRow — a group', () => {
  it('descends a level rather than navigating away', async () => {
    const onDrill = renderRow(LUBRICATION)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /смазване/ }))

    expect(onDrill).toHaveBeenCalledWith(LUBRICATION)
  })

  it('counts the subgroups it holds', () => {
    renderRow(LUBRICATION)

    expect(screen.getByText('2 подгрупи · 131')).toBeInTheDocument()
  })

  it('counts a lone subgroup in the singular', () => {
    renderRow(node('100248', 'смазване', 131, [OIL_FILTER]))

    expect(screen.getByText('1 подгрупа · 131')).toBeInTheDocument()
  })
})

describe('CategoryPanelRow — a leaf', () => {
  // Nothing is left to open, so the row is a destination.
  it('links to the search carrying its ancestors and itself', () => {
    renderRow(OIL_FILTER)

    const link = screen.getByRole('link', { name: /маслен филтър/ })
    const params = new URLSearchParams(
      link.getAttribute('href')!.split('?')[1],
    )

    expect(params.get('vehicleId')).toBe('13074')
    expect(params.getAll('cat')).toEqual(['100002', '100259'])
    expect(params.get('catHasChildren')).toBe('false')
  })

  it('says how many parts it holds', () => {
    renderRow(OIL_FILTER)

    expect(screen.getByText('119 части')).toBeInTheDocument()
  })

  it('says a single part in the singular', () => {
    renderRow(node('100259', 'маслен филтър', 1))

    expect(screen.getByText('1 част')).toBeInTheDocument()
  })

  it('carries the path alone when no car is picked', () => {
    render(
      <ul>
        <CategoryPanelRow
          node={OIL_FILTER}
          ancestors={[ENGINE]}
          onDrill={jest.fn()}
        />
      </ul>,
    )

    const params = new URLSearchParams(
      screen.getByRole('link').getAttribute('href')!.split('?')[1],
    )

    expect(params.has('vehicleId')).toBe(false)
    expect(params.getAll('cat')).toEqual(['100002', '100259'])
  })
})
