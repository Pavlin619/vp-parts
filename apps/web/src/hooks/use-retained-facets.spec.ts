import { renderHook } from '@testing-library/react'
import { useRetainedFacets } from './use-retained-facets'

describe('useRetainedFacets', () => {
  it('passes a non-empty block straight through', () => {
    const { result } = renderHook(() => useRetainedFacets(['a', 'b'], 'key-1'))

    expect(result.current).toEqual(['a', 'b'])
  })

  // The hook updates state during render, so an identity-based comparison
  // would never settle for a caller that builds the array inline.
  it('settles when the same block arrives as a new array each render', () => {
    const { result, rerender } = renderHook(() =>
      useRetainedFacets([...['a', 'b']], 'key-1'),
    )

    rerender()

    expect(result.current).toEqual(['a', 'b'])
  })

  it('starts empty when the first block is empty', () => {
    const { result } = renderHook(() => useRetainedFacets([], 'key-1'))

    expect(result.current).toEqual([])
  })

  // Page 2+ carries no attribute block, so without retention the dimension
  // filters would disappear the moment the visitor paginated.
  it('keeps the last block when a later render has none', () => {
    const { result, rerender } = renderHook(
      ({ facets }: { facets?: string[] }) =>
        useRetainedFacets(facets, 'key-1'),
      { initialProps: { facets: ['a'] as string[] | undefined } },
    )

    rerender({ facets: undefined })
    expect(result.current).toEqual(['a'])

    rerender({ facets: [] })
    expect(result.current).toEqual(['a'])
  })

  it('replaces the retained block when a newer non-empty one arrives', () => {
    const { result, rerender } = renderHook(
      ({ facets }: { facets?: string[] }) =>
        useRetainedFacets(facets, 'key-1'),
      { initialProps: { facets: ['a'] as string[] | undefined } },
    )

    rerender({ facets: ['b', 'c'] })

    expect(result.current).toEqual(['b', 'c'])
  })

  // A block that describes another result set is worse than no block: it would
  // offer values that match nothing in the results on screen.
  it('drops the retained block when the scope changes', () => {
    const { result, rerender } = renderHook(
      ({ facets, scopeKey }: { facets?: string[]; scopeKey: string }) =>
        useRetainedFacets(facets, scopeKey),
      {
        initialProps: {
          facets: ['a'] as string[] | undefined,
          scopeKey: 'key-1',
        },
      },
    )

    rerender({ facets: undefined, scopeKey: 'key-2' })

    expect(result.current).toEqual([])
  })
})
