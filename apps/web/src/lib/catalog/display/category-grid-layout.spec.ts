import {
  CATEGORY_GRID_MAX_COLUMNS,
  categoryGridColumns,
  chunkIntoRows,
} from './category-grid-layout'

describe('categoryGridColumns', () => {
  it('widens to four columns only once the grid is wide enough', () => {
    expect(categoryGridColumns(1200)).toBe(CATEGORY_GRID_MAX_COLUMNS)
    expect(categoryGridColumns(1000)).toBe(CATEGORY_GRID_MAX_COLUMNS)
    expect(categoryGridColumns(999)).toBe(3)
  })

  it('steps down to three and then two', () => {
    expect(categoryGridColumns(680)).toBe(3)
    expect(categoryGridColumns(679)).toBe(2)
  })

  // A grid measured before layout reports 0, which must not divide the cards
  // into no columns at all.
  it('never falls below two columns, whatever the width', () => {
    expect(categoryGridColumns(0)).toBe(2)
  })
})

describe('chunkIntoRows', () => {
  it('fills each row before starting the next and keeps the short last one', () => {
    expect(chunkIntoRows(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e'],
    ])
  })

  it('returns no rows for no items', () => {
    expect(chunkIntoRows([], 4)).toEqual([])
  })

  // Guards the loop against a column count that would never advance it.
  it('treats a column count below one as a single column', () => {
    expect(chunkIntoRows(['a', 'b'], 0)).toEqual([['a'], ['b']])
  })
})
