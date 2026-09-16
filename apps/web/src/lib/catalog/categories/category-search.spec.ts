import {
  CATEGORY_MATCH_LIMIT,
  searchCategoryTree,
} from './category-search'
import type { CategoryTreeNode } from './category-tree'

function node(
  id: string,
  name: string,
  children: CategoryTreeNode[] = [],
): CategoryTreeNode {
  return {
    category: { id, name, parentId: null, articleCount: 1, sortNo: 1 },
    children,
  }
}

const TREE: CategoryTreeNode[] = [
  node('100005', 'филтър', [
    node('100259', 'маслен филтър'),
    node('100263', 'филтър купе'),
  ]),
  node('100241', 'отопление/вентилация', [
    node('100346', 'филтър купе'),
  ]),
  node('100006', 'спирачна уредба', [node('100270', 'накладки')]),
]

const namesOf = (result: ReturnType<typeof searchCategoryTree>) =>
  result.matches.map((match) => match.node.category.name)

describe('searchCategoryTree', () => {
  it('matches at every depth, parents before their children', () => {
    expect(namesOf(searchCategoryTree(TREE, 'филтър'))).toEqual([
      'филтър',
      'маслен филтър',
      'филтър купе',
      'филтър купе',
    ])
  })

  it('ignores case and surrounding space', () => {
    expect(namesOf(searchCategoryTree(TREE, '  НАКЛАДКИ '))).toEqual([
      'накладки',
    ])
  })

  it('answers nothing for an empty term rather than the whole tree', () => {
    expect(searchCategoryTree(TREE, '   ')).toEqual({ matches: [], total: 0 })
  })

  // The label alone cannot tell the two `филтър купе` nodes apart, so each hit
  // carries the chain that leads to it.
  it('carries the path from the root down to the hit', () => {
    const [first, second] = searchCategoryTree(TREE, 'филтър купе').matches

    expect(first.path.map((step) => step.category.id)).toEqual([
      '100005',
      '100263',
    ])
    expect(second.path.map((step) => step.category.id)).toEqual([
      '100241',
      '100346',
    ])
  })

  it('stops at the limit instead of listing a whole tree', () => {
    const wide = Array.from({ length: 60 }, (_, index) =>
      node(String(index), `филтър ${index}`),
    )

    expect(searchCategoryTree(wide, 'филтър').matches).toHaveLength(
      CATEGORY_MATCH_LIMIT,
    )
    expect(searchCategoryTree(wide, 'филтър', 5).matches).toHaveLength(5)
  })

  // Truncating without counting is what let the list call itself the whole
  // answer, so the total is counted over the tree the limit stopped listing.
  it('counts every hit even past the limit', () => {
    const wide = Array.from({ length: 60 }, (_, index) =>
      node(String(index), `филтър ${index}`),
    )

    expect(searchCategoryTree(wide, 'филтър', 5).total).toBe(60)
    expect(searchCategoryTree(TREE, 'филтър').total).toBe(4)
  })
})
