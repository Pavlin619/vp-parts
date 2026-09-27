import { act, render, screen, waitFor } from '@testing-library/react'
import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import { OfficeMap } from './office-map'

type OfficeMapProps = Parameters<typeof OfficeMap>[0]

type Handler = (event?: unknown) => void

interface FakeMap {
  options: Record<string, unknown>
  handlers: Map<string, Handler>
  source: { setData: jest.Mock; getClusterExpansionZoom: jest.Mock }
  locationSource: { setData: jest.Mock }
  fitBounds: jest.Mock
  easeTo: jest.Mock
  setFilter: jest.Mock
  addImage: jest.Mock
  remove: jest.Mock
  fire: (event: string, layer?: string, payload?: unknown) => void
}

const maps: FakeMap[] = []
const setWorkerUrl = jest.fn()
let isWebGlMissing = false
const loadSvgImage = jest.fn()

jest.mock('@/lib/checkout/delivery/office-pin', () => ({
  ...jest.requireActual('@/lib/checkout/delivery/office-pin'),
  loadSvgImage: (svg: string) => loadSvgImage(svg),
}))

// Virtual: the package publishes only an ESM entry, which Jest's resolver cannot see.
jest.mock('maplibre-gl', () => ({
  setWorkerUrl: (url: string) => setWorkerUrl(url),
  NavigationControl: class {},
  Map: class {
    options: Record<string, unknown>
    handlers = new Map<string, Handler>()
    source = {
      setData: jest.fn(),
      getClusterExpansionZoom: jest.fn().mockResolvedValue(11),
    }
    locationSource = { setData: jest.fn() }
    fitBounds = jest.fn()
    easeTo = jest.fn()
    setFilter = jest.fn()
    addImage = jest.fn()
    remove = jest.fn()

    constructor(options: Record<string, unknown>) {
      if (isWebGlMissing) {
        throw new Error('Failed to initialize WebGL')
      }
      this.options = options
      maps.push(this as unknown as FakeMap)
    }

    on(event: string, layerOrHandler: string | Handler, handler?: Handler) {
      const key = handler ? `${event}:${layerOrHandler as string}` : event
      this.handlers.set(key, handler ?? (layerOrHandler as Handler))
      return this
    }

    fire(event: string, layer?: string, payload?: unknown) {
      this.handlers.get(layer ? `${event}:${layer}` : event)?.(payload)
    }

    addControl() {}
    addSource() {}
    addLayer() {}
    hasImage() {
      return false
    }
    getSource(id: string) {
      return id === 'offices' ? this.source : this.locationSource
    }
    getCanvas() {
      return { style: {} }
    }
    isStyleLoaded() {
      return false
    }
  },
}), { virtual: true })

function office(overrides: Partial<DeliveryOfficeDto> = {}): DeliveryOfficeDto {
  return {
    carrier: ShippingMethod.ECONT,
    code: '1127',
    name: 'София Младост',
    city: 'София',
    postCode: null,
    address: 'София бул. Александър Малинов №51',
    latitude: 42.65,
    longitude: 23.37,
    type: DeliveryOfficeType.OFFICE,
    weekdayHours: null,
    saturdayHours: null,
    ...overrides,
  }
}

const OFFICES = [
  office({ code: '1', latitude: 42.1, longitude: 23.3 }),
  office({ code: '2', latitude: 43.2, longitude: 27.9 }),
]

function mapProps(overrides: Partial<OfficeMapProps> = {}): OfficeMapProps {
  return {
    offices: OFFICES,
    carrier: ShippingMethod.ECONT,
    framingKey: 'all',
    selectedCode: null,
    hoveredCode: null,
    referencePoint: null,
    onSelect: jest.fn(),
    onHover: jest.fn(),
    ...overrides,
  }
}

async function loadedMap(): Promise<FakeMap> {
  await waitFor(() => expect(maps).toHaveLength(1))
  const map = maps[0]
  await act(async () => map.fire('load'))
  return map
}

describe('OfficeMap', () => {
  beforeEach(() => {
    maps.length = 0
    isWebGlMissing = false
    loadSvgImage.mockReset().mockResolvedValue({})
  })

  it('draws the offices it is given once the map has loaded', async () => {
    render(<OfficeMap {...mapProps()} />)

    const map = await loadedMap()

    await waitFor(() =>
      expect(map.source.setData).toHaveBeenLastCalledWith(
        expect.objectContaining({
          features: [
            expect.objectContaining({ properties: { code: '1', carrier: 'ECONT', type: 'OFFICE' } }),
            expect.objectContaining({ properties: { code: '2', carrier: 'ECONT', type: 'OFFICE' } }),
          ],
        }),
      ),
    )
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [23.3, 42.1],
        [27.9, 43.2],
      ],
      expect.anything(),
    )
  })

  // Found beside the library by default, which a bundled chunk is not.
  it('loads the map worker from the copy served by the site', async () => {
    render(<OfficeMap {...mapProps()} />)

    await loadedMap()

    expect(setWorkerUrl).toHaveBeenCalledWith('/vendor/maplibre/maplibre-gl-worker.mjs')
  })

  it('redraws when the search narrows the offices', async () => {
    const { rerender } = render(<OfficeMap {...mapProps()} />)
    const map = await loadedMap()

    rerender(<OfficeMap {...mapProps({ offices: [OFFICES[1]], framingKey: 'narrowed' })} />)

    await waitFor(() =>
      expect(map.source.setData).toHaveBeenLastCalledWith(
        expect.objectContaining({
          features: [
            expect.objectContaining({ properties: { code: '2', carrier: 'ECONT', type: 'OFFICE' } }),
          ],
        }),
      ),
    )
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      [
        [27.9, 43.2],
        [27.9, 43.2],
      ],
      expect.anything(),
    )
  })

  it('redraws once the customer stops typing, not on every keystroke', async () => {
    const { rerender } = render(<OfficeMap {...mapProps()} />)
    const map = await loadedMap()
    await waitFor(() => expect(map.source.setData).toHaveBeenCalledTimes(1))

    rerender(<OfficeMap {...mapProps({ offices: OFFICES.slice(), framingKey: 'п' })} />)
    rerender(<OfficeMap {...mapProps({ offices: [OFFICES[1]], framingKey: 'пл' })} />)

    await waitFor(() => expect(map.source.setData).toHaveBeenCalledTimes(2))
    expect(map.fitBounds).toHaveBeenCalledTimes(2)
  })

  // Lockers drop out while the parcel is re-weighed; the customer's pan and zoom stay put.
  it('redraws without moving the map when the offices change but the search does not', async () => {
    const { rerender } = render(<OfficeMap {...mapProps()} />)
    const map = await loadedMap()
    await waitFor(() => expect(map.fitBounds).toHaveBeenCalledTimes(1))

    rerender(<OfficeMap {...mapProps({ offices: [OFFICES[0]] })} />)

    await waitFor(() => expect(map.source.setData).toHaveBeenCalledTimes(2))
    expect(map.fitBounds).toHaveBeenCalledTimes(1)
    expect(map.easeTo).not.toHaveBeenCalled()
  })

  it('keeps the open office in view when the search changes around it', async () => {
    const { rerender } = render(<OfficeMap {...mapProps()} />)
    const map = await loadedMap()
    await waitFor(() => expect(map.fitBounds).toHaveBeenCalledTimes(1))

    rerender(<OfficeMap {...mapProps({ selectedCode: '2', framingKey: 'city' })} />)

    await waitFor(() => expect(map.source.setData).toHaveBeenCalledTimes(2))
    expect(map.fitBounds).toHaveBeenCalledTimes(1)
    expect(map.easeTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [27.9, 43.2] }),
    )
  })

  it('frames the point the list is sorted by, with the offices nearest it', async () => {
    render(
      <OfficeMap
        {...mapProps({
          referencePoint: { latitude: 42.0, longitude: 23.0, kind: 'device', label: 'вас' },
        })}
      />,
    )

    const map = await loadedMap()

    await waitFor(() =>
      expect(map.fitBounds).toHaveBeenCalledWith(
        [
          [23.0, 42.0],
          [27.9, 43.2],
        ],
        expect.anything(),
      ),
    )
  })

  it('reframes when the point the list is sorted by changes', async () => {
    const { rerender } = render(<OfficeMap {...mapProps()} />)
    const map = await loadedMap()
    await waitFor(() => expect(map.fitBounds).toHaveBeenCalledTimes(1))

    rerender(
      <OfficeMap
        {...mapProps({
          referencePoint: { latitude: 42.0, longitude: 23.0, kind: 'device', label: 'вас' },
          framingKey: 'near-me',
        })}
      />,
    )

    await waitFor(() => expect(map.fitBounds).toHaveBeenCalledTimes(2))
  })

  it('marks where the customer is', async () => {
    render(
      <OfficeMap
        {...mapProps({
          referencePoint: { latitude: 42.0, longitude: 23.0, kind: 'device', label: 'вас' },
        })}
      />,
    )

    const map = await loadedMap()

    await waitFor(() =>
      expect(map.locationSource.setData).toHaveBeenLastCalledWith({
        type: 'FeatureCollection',
        features: [expect.objectContaining({ geometry: { type: 'Point', coordinates: [23.0, 42.0] } })],
      }),
    )
  })

  // The chosen office already has its pin; it is not where the customer is.
  it('marks no location when sorting by the chosen office', async () => {
    render(
      <OfficeMap
        {...mapProps({
          referencePoint: { latitude: 42.1, longitude: 23.3, kind: 'chosen-office', label: 'Офис' },
        })}
      />,
    )

    const map = await loadedMap()

    await waitFor(() =>
      expect(map.locationSource.setData).toHaveBeenLastCalledWith({
        type: 'FeatureCollection',
        features: [],
      }),
    )
  })

  it('reports the office whose marker is clicked', async () => {
    const onSelect = jest.fn()
    render(<OfficeMap {...mapProps({ onSelect })} />)
    const map = await loadedMap()

    act(() =>
      map.fire('click', 'office-points', {
        features: [{ properties: { code: '2' } }],
      }),
    )

    expect(onSelect).toHaveBeenCalledWith('2')
  })

  it('zooms into a cluster when it is clicked', async () => {
    render(<OfficeMap {...mapProps()} />)
    const map = await loadedMap()

    act(() =>
      map.fire('click', 'office-clusters', {
        features: [
          { properties: { cluster_id: 5 }, geometry: { type: 'Point', coordinates: [23.3, 42.7] } },
        ],
      }),
    )

    await waitFor(() =>
      expect(map.easeTo).toHaveBeenCalledWith({ center: [23.3, 42.7], zoom: 11 }),
    )
    expect(map.source.getClusterExpansionZoom).toHaveBeenCalledWith(5)
  })

  // A keystroke can replace the offices while the cluster's zoom is being worked out.
  it('ignores a cluster that is gone before its zoom resolves', async () => {
    const onUnhandledRejection = jest.fn()
    process.on('unhandledRejection', onUnhandledRejection)
    render(<OfficeMap {...mapProps()} />)
    const map = await loadedMap()
    map.source.getClusterExpansionZoom.mockRejectedValueOnce(new Error('No cluster with the specified id'))

    act(() =>
      map.fire('click', 'office-clusters', {
        features: [
          { properties: { cluster_id: 5 }, geometry: { type: 'Point', coordinates: [23.3, 42.7] } },
        ],
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    process.off('unhandledRejection', onUnhandledRejection)
    expect(onUnhandledRejection).not.toHaveBeenCalled()
    expect(map.easeTo).not.toHaveBeenCalled()
  })

  it('reports the office whose marker the pointer is over', async () => {
    const onHover = jest.fn()
    render(<OfficeMap {...mapProps({ onHover })} />)
    const map = await loadedMap()

    act(() => map.fire('mousemove', 'office-points', { features: [{ properties: { code: '1' } }] }))
    expect(onHover).toHaveBeenLastCalledWith('1')

    act(() => map.fire('mouseleave', 'office-points'))
    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it('rings the office hovered in the list without moving the map', async () => {
    const { rerender } = render(<OfficeMap {...mapProps()} />)
    const map = await loadedMap()
    map.easeTo.mockClear()

    rerender(<OfficeMap {...mapProps({ hoveredCode: '1' })} />)

    expect(map.setFilter).toHaveBeenLastCalledWith('office-hovered', ['==', ['get', 'code'], '1'])
    expect(map.easeTo).not.toHaveBeenCalled()
  })

  it('highlights and centres on the chosen office', async () => {
    render(<OfficeMap {...mapProps({ selectedCode: '2' })} />)
    const map = await loadedMap()

    expect(map.setFilter).toHaveBeenCalledWith('office-selected', ['==', ['get', 'code'], '2'])
    expect(map.easeTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [27.9, 43.2] }),
    )
  })

  // The list is still there to choose from; the map is a second way in.
  it('points to the list when the map cannot be drawn', async () => {
    isWebGlMissing = true

    render(<OfficeMap {...mapProps()} />)

    expect(
      await screen.findByText('Картата не може да се зареди. Изберете офис от списъка.'),
    ).toBeInTheDocument()
  })

  it('points to the list when the map style cannot be fetched', async () => {
    render(<OfficeMap {...mapProps()} />)
    await waitFor(() => expect(maps).toHaveLength(1))

    act(() => maps[0].fire('error'))

    expect(
      screen.getByText('Картата не може да се зареди. Изберете офис от списъка.'),
    ).toBeInTheDocument()
  })

  it('gives every carrier and office type its pin, and a selected pin per type', async () => {
    render(<OfficeMap {...mapProps()} />)
    const map = await loadedMap()

    const imageIds = map.addImage.mock.calls.map(([id]) => id)
    expect(imageIds).toEqual(
      expect.arrayContaining([
        'office-pin-ECONT-OFFICE',
        'office-pin-ECONT-LOCKER',
        'office-pin-selected-OFFICE',
        'office-pin-selected-LOCKER',
      ]),
    )
    expect(map.addImage).toHaveBeenCalledWith('office-pin-ECONT-LOCKER', expect.anything(), {
      pixelRatio: 2,
    })
  })

  it('points to the list when the pins cannot be drawn', async () => {
    loadSvgImage.mockRejectedValue(new Error('decode failed'))
    render(<OfficeMap {...mapProps()} />)

    await loadedMap()

    expect(
      screen.getByText('Картата не може да се зареди. Изберете офис от списъка.'),
    ).toBeInTheDocument()
  })

  it('releases the map when it unmounts', async () => {
    const { unmount } = render(<OfficeMap {...mapProps()} />)
    const map = await loadedMap()

    unmount()

    expect(map.remove).toHaveBeenCalled()
  })
})
