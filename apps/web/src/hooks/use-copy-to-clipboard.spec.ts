import { act, renderHook } from '@testing-library/react'
import { COPIED_RESET_MS, useCopyToClipboard } from './use-copy-to-clipboard'

const writeText = jest.fn<Promise<void>, [string]>()

beforeAll(() => {
  // jsdom ships no clipboard; userEvent installs one, but this hook is tested
  // without a component so it needs its own.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
})

beforeEach(() => {
  jest.useFakeTimers()
  writeText.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('useCopyToClipboard', () => {
  it('writes the value and confirms the copy', async () => {
    const { result } = renderHook(() => useCopyToClipboard('WL6340'))

    await act(() => result.current.copy())

    expect(writeText).toHaveBeenCalledWith('WL6340')
    expect(result.current.isCopied).toBe(true)
  })

  it('drops the confirmation once the window passes', async () => {
    const { result } = renderHook(() => useCopyToClipboard('WL6340'))
    await act(() => result.current.copy())

    act(() => jest.advanceTimersByTime(COPIED_RESET_MS))

    expect(result.current.isCopied).toBe(false)
  })

  // Clipboard access can be denied (insecure origin, permissions). The value is
  // still on screen, so the only wrong move is claiming a copy that never was.
  it('confirms nothing when the clipboard rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const { result } = renderHook(() => useCopyToClipboard('WL6340'))

    await act(() => result.current.copy())

    expect(result.current.isCopied).toBe(false)
  })

  it('restarts the window when the value is copied again', async () => {
    const { result } = renderHook(() => useCopyToClipboard('WL6340'))

    await act(() => result.current.copy())
    act(() => jest.advanceTimersByTime(COPIED_RESET_MS / 2))
    await act(() => result.current.copy())
    act(() => jest.advanceTimersByTime(COPIED_RESET_MS / 2))

    // The first copy's timer would have fired by now had it not been replaced.
    expect(result.current.isCopied).toBe(true)
  })

  it('cancels a pending reset when the caller unmounts', async () => {
    const { result, unmount } = renderHook(() => useCopyToClipboard('WL6340'))
    await act(() => result.current.copy())
    const pendingBeforeUnmount = jest.getTimerCount()

    unmount()

    expect(jest.getTimerCount()).toBe(pendingBeforeUnmount - 1)
  })
})
