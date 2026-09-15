import type { AssemblyGroupDto } from '@vp-parts-shop/shared'
import { buildCategoryTree } from './category-tree'

const cat = (
  id: string,
  parentId: string | null,
  name = id,
): AssemblyGroupDto => ({
  id,
  name,
  parentId,
  articleCount: 0,
  sortNo: 1,
})

describe('buildCategoryTree', () => {
  it('returns an empty array for empty input', () => {
    expect(buildCategoryTree([])).toEqual([])
  })

  it('returns root nodes when all parentIds are null', () => {
    const tree = buildCategoryTree([cat('1', null, 'Engine'), cat('2', null, 'Brakes')])
    expect(tree).toHaveLength(2)
    expect(tree[0].category.id).toBe('1')
    expect(tree[1].category.id).toBe('2')
  })

  it('nests child nodes under their parent', () => {
    const tree = buildCategoryTree([
      cat('1', null, 'Engine'),
      cat('2', '1', 'Oil filters'),
      cat('3', '1', 'Air filters'),
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].children).toHaveLength(2)
    expect(tree[0].children[0].category.id).toBe('2')
    expect(tree[0].children[1].category.id).toBe('3')
  })

  it('preserves the order siblings arrive in', () => {
    const tree = buildCategoryTree([
      cat('100001', null, 'каросерия'),
      cat('100002', null, 'двигател'),
      cat('100005', null, 'филтър'),
    ])
    expect(tree.map((node) => node.category.name)).toEqual([
      'каросерия',
      'двигател',
      'филтър',
    ])
  })

  it('treats nodes with a missing parent as roots (orphan handling)', () => {
    const tree = buildCategoryTree([cat('2', 'nonexistent')])
    expect(tree).toHaveLength(1)
    expect(tree[0].category.id).toBe('2')
    expect(tree[0].children).toHaveLength(0)
  })

  it('builds a multi-level nested tree', () => {
    const tree = buildCategoryTree([cat('1', null), cat('2', '1'), cat('3', '2')])
    expect(tree[0].children[0].children[0].category.id).toBe('3')
  })

  it('root nodes have an empty children array', () => {
    const tree = buildCategoryTree([cat('1', null)])
    expect(tree[0].children).toEqual([])
  })
})
