import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CategoryTreeNode } from '@/lib/catalog/category-tree'
import { CategoryPathBar } from './category-path-bar'

function node(id: string, name: string): CategoryTreeNode {
  return {
    category: { id, name, parentId: null, articleCount: 1, sortNo: 1 },
    children: [],
  }
}

const LUBRICATION = node('100248', 'смазване')
const OIL_FILTER = node('100259', 'маслен филтър')

function renderBar(path: CategoryTreeNode[]) {
  const onNavigate = jest.fn()

  render(
    <CategoryPathBar rootName="двигател" path={path} onNavigate={onNavigate} />,
  )

  return onNavigate
}

describe('CategoryPathBar', () => {
  // The root's own name is already the panel's heading, so at that level the
  // bar would only offer a step to where the visitor is standing.
  it('renders nothing at the root level', () => {
    const { container } = render(
      <CategoryPathBar rootName="двигател" path={[]} onNavigate={jest.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('steps back to the root from one level down', async () => {
    const onNavigate = renderBar([LUBRICATION])

    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))

    expect(onNavigate).toHaveBeenCalledWith(0)
  })

  // `Назад` is one level, not all the way out — the difference only shows up
  // below the second level.
  it('steps back exactly one level from two down', async () => {
    const onNavigate = renderBar([LUBRICATION, OIL_FILTER])

    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))

    expect(onNavigate).toHaveBeenCalledWith(1)
  })

  it('jumps out to the root from its segment', async () => {
    const onNavigate = renderBar([LUBRICATION, OIL_FILTER])

    await userEvent.click(screen.getByRole('button', { name: 'двигател' }))

    expect(onNavigate).toHaveBeenCalledWith(0)
  })

  it('jumps to an intermediate level from its segment', async () => {
    const onNavigate = renderBar([LUBRICATION, OIL_FILTER])

    await userEvent.click(screen.getByRole('button', { name: 'смазване' }))

    expect(onNavigate).toHaveBeenCalledWith(1)
  })

  // The deepest entry is the heading directly below the bar.
  it('lists the levels above the current one but not the current one', () => {
    renderBar([LUBRICATION, OIL_FILTER])

    expect(screen.getByRole('button', { name: 'смазване' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'маслен филтър' }),
    ).not.toBeInTheDocument()
  })
})
