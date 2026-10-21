import { act, renderHook } from '@testing-library/react'
import { useOrderAccessKey } from './use-order-access-key'

afterEach(() => {
  window.location.hash = ''
})

describe('useOrderAccessKey', () => {
  it('reads the key a guest’s order link carries in its fragment', () => {
    window.location.hash = '#k=key-1'

    expect(renderHook(() => useOrderAccessKey()).result.current).toBe('key-1')
  })

  it('answers null for a link that carries none', () => {
    expect(renderHook(() => useOrderAccessKey()).result.current).toBeNull()
  })

  it('follows a fragment that changes on the page', () => {
    const { result } = renderHook(() => useOrderAccessKey())

    act(() => {
      window.location.hash = '#k=key-2'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(result.current).toBe('key-2')
  })
})
