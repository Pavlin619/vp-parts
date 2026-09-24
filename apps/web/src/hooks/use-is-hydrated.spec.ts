import { renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { useIsHydrated } from './use-is-hydrated'

function Probe() {
  return createElement('span', null, String(useIsHydrated()))
}

describe('useIsHydrated', () => {
  it('reads false while rendering on the server', () => {
    expect(renderToString(createElement(Probe))).toBe('<span>false</span>')
  })

  it('reads true once mounted on the client', () => {
    const { result } = renderHook(() => useIsHydrated())

    expect(result.current).toBe(true)
  })
})
