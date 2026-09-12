import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CategoryTreeNode } from '@/lib/catalog/category-tree'
import { CategoryCard } from './category-card'

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

const FILTERS = node('100005', 'филтър', 788, [
  node('100259', 'маслен филтър', 119),
  node('100260', 'въздушен филтър', 149),
  node('100261', 'горивен филтър', 104),
  node('100263', 'филтър купе', 262),
])

/** A root TecDoc files no children under — it leads straight to a listing. */
const HEADLIGHT_CLEANING = node('100342', 'почистване на фаровете', 41)

function renderCard(root: CategoryTreeNode, isOpen = false) {
  const onToggle = jest.fn()
  render(
    <CategoryCard
      node={root}
      vehicleId="13074"
      isOpen={isOpen}
      panelId="category-panel-100005"
      onToggle={onToggle}
    />,
  )
  return onToggle
}

describe('CategoryCard — a root with groups under it', () => {
  it('previews the groups inside it and how many are left over', () => {
    renderCard(FILTERS)

    expect(
      screen.getByText('маслен филтър · въздушен филтър · горивен филтър · +1'),
    ).toBeInTheDocument()
  })

  it('expands in place rather than navigating', async () => {
    const onToggle = renderCard(FILTERS)
    const card = screen.getByRole('button', { name: /филтър/ })

    expect(card).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()

    await userEvent.click(card)
    expect(onToggle).toHaveBeenCalled()
  })

  it('reports itself as expanded while its panel is open', () => {
    renderCard(FILTERS, true)

    expect(screen.getByRole('button', { name: /филтър/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  // The panel opens after the whole row rather than under the card, which is
  // too far for the reading order alone to connect the two.
  it('names the panel it opened', () => {
    renderCard(FILTERS, true)

    expect(screen.getByRole('button', { name: /филтър/ })).toHaveAttribute(
      'aria-controls',
      'category-panel-100005',
    )
  })

  it('points at no panel while it is closed', () => {
    renderCard(FILTERS)

    expect(
      screen.getByRole('button', { name: /филтър/ }),
    ).not.toHaveAttribute('aria-controls')
  })
})

describe('CategoryCard — a root with nothing under it', () => {
  // There is no level left to open, so an expander would open an empty panel.
  it('links straight to the listing, scoped to the car and the category', () => {
    renderCard(HEADLIGHT_CLEANING)

    const link = screen.getByRole('link', { name: /почистване на фаровете/ })
    const params = new URLSearchParams(
      link.getAttribute('href')!.split('?')[1],
    )

    expect(params.get('vehicleId')).toBe('13074')
    expect(params.getAll('cat')).toEqual(['100342'])
    expect(params.get('catHasChildren')).toBe('false')
  })

  it('says how many parts it holds instead of listing groups', () => {
    renderCard(HEADLIGHT_CLEANING)

    expect(screen.getByText('41 части')).toBeInTheDocument()
  })
})
