import { act, renderHook } from '@testing-library/react'
import { useDeviceLocation } from './use-device-location'

const PERMISSION_DENIED = 1
const POSITION_UNAVAILABLE = 2

type Succeed = (position: { coords: { latitude: number; longitude: number } }) => void
type Fail = (error: { code: number; PERMISSION_DENIED: number }) => void

const getCurrentPosition = jest.fn<void, [Succeed, Fail, PositionOptions?]>()

function installGeolocation(geolocation: unknown) {
  Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true })
}

function answerWith(latitude: number, longitude: number) {
  getCurrentPosition.mockImplementation((succeed) => succeed({ coords: { latitude, longitude } }))
}

function refuseWith(code: number) {
  getCurrentPosition.mockImplementation((_, fail) => fail({ code, PERMISSION_DENIED }))
}

beforeEach(() => {
  getCurrentPosition.mockReset()
  installGeolocation({ getCurrentPosition })
})

describe('useDeviceLocation', () => {
  it('asks for nothing until the customer asks to be located', () => {
    const { result } = renderHook(() => useDeviceLocation())

    expect(result.current.status).toBe('idle')
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('hands over where the device is', () => {
    answerWith(42.69, 23.32)
    const onLocated = jest.fn()
    const { result } = renderHook(() => useDeviceLocation())

    act(() => result.current.locate(onLocated))

    expect(onLocated).toHaveBeenCalledWith({ latitude: 42.69, longitude: 23.32 })
    expect(result.current.status).toBe('idle')
  })

  it('reports that it is locating while the device answers', () => {
    const { result } = renderHook(() => useDeviceLocation())

    act(() => result.current.locate(jest.fn()))

    expect(result.current.status).toBe('locating')
  })

  // City-level is enough to sort offices, and a fresh GPS fix can take a long time.
  it('asks for a coarse and recent position', () => {
    const { result } = renderHook(() => useDeviceLocation())

    act(() => result.current.locate(jest.fn()))

    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ enableHighAccuracy: false, timeout: expect.any(Number) }),
    )
  })

  it('reports a refused permission', () => {
    refuseWith(PERMISSION_DENIED)
    const onLocated = jest.fn()
    const { result } = renderHook(() => useDeviceLocation())

    act(() => result.current.locate(onLocated))

    expect(result.current.status).toBe('denied')
    expect(onLocated).not.toHaveBeenCalled()
  })

  it('reports a device that cannot tell where it is', () => {
    refuseWith(POSITION_UNAVAILABLE)
    const { result } = renderHook(() => useDeviceLocation())

    act(() => result.current.locate(jest.fn()))

    expect(result.current.status).toBe('unavailable')
  })

  it('reports a browser without geolocation as unable to tell', () => {
    installGeolocation(undefined)
    const { result } = renderHook(() => useDeviceLocation())

    act(() => result.current.locate(jest.fn()))

    expect(result.current.status).toBe('unavailable')
  })
})
