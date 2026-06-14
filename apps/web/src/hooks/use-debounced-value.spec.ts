import { renderHook, act } from '@testing-library/react'
import { useDebouncedValue } from './use-debounced-value'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('initial', 300))

    expect(result.current).toBe('initial')
  })

  it('does not update before the delay has elapsed', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'first' } },
    )

    rerender({ value: 'second' })
    act(() => {
      jest.advanceTimersByTime(299)
    })

    expect(result.current).toBe('first')
  })

  it('updates after the delay has elapsed', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'first' } },
    )

    rerender({ value: 'second' })
    act(() => {
      jest.advanceTimersByTime(300)
    })

    expect(result.current).toBe('second')
  })

  it('restarts the timer when the value changes mid-delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'first' } },
    )

    rerender({ value: 'second' })
    act(() => {
      jest.advanceTimersByTime(200)
    })
    rerender({ value: 'third' })
    act(() => {
      jest.advanceTimersByTime(200)
    })

    expect(result.current).toBe('first')

    act(() => {
      jest.advanceTimersByTime(100)
    })

    expect(result.current).toBe('third')
  })
})
