import { buildTree } from './category-nav'

const cat = (id: string, parentId: string | null, name = id) => ({
  id,
  name,
  parentId,
})

describe('buildTree', () => {
  it('returns an empty array for empty input', () => {
    expect(buildTree([])).toEqual([])
  })

  it('returns root nodes when all parentIds are null', () => {
    const tree = buildTree([cat('1', null, 'Engine'), cat('2', null, 'Brakes')])
    expect(tree).toHaveLength(2)
    expect(tree[0].category.id).toBe('1')
    expect(tree[1].category.id).toBe('2')
  })

  it('nests child nodes under their parent', () => {
    const tree = buildTree([
      cat('1', null, 'Engine'),
      cat('2', '1', 'Oil filters'),
      cat('3', '1', 'Air filters'),
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].children).toHaveLength(2)
    expect(tree[0].children[0].category.id).toBe('2')
    expect(tree[0].children[1].category.id).toBe('3')
  })

  it('treats nodes with a missing parent as roots (orphan handling)', () => {
    const tree = buildTree([cat('2', 'nonexistent')])
    expect(tree).toHaveLength(1)
    expect(tree[0].category.id).toBe('2')
    expect(tree[0].children).toHaveLength(0)
  })

  it('builds a multi-level nested tree', () => {
    const tree = buildTree([
      cat('1', null),
      cat('2', '1'),
      cat('3', '2'),
    ])
    expect(tree[0].children[0].children[0].category.id).toBe('3')
  })

  it('root nodes have an empty children array', () => {
    const tree = buildTree([cat('1', null)])
    expect(tree[0].children).toEqual([])
  })
})
