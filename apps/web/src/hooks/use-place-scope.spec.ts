import { act, renderHook } from '@testing-library/react'
import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
  type DeliveryPlaceDto,
} from '@vp-parts-shop/shared'
import { usePlaceScope } from './use-place-scope'

function office(overrides: Partial<DeliveryOfficeDto>): DeliveryOfficeDto {
  return {
    carrier: ShippingMethod.ECONT,
    code: '1000',
    name: 'Офис',
    placeId: '41',
    city: 'София',
    postCode: null,
    address: 'ул. Първа 1',
    latitude: 42.7,
    longitude: 23.3,
    type: DeliveryOfficeType.OFFICE,
    weekdayHours: null,
    saturdayHours: null,
    ...overrides,
  }
}

function place(overrides: Partial<DeliveryPlaceDto>): DeliveryPlaceDto {
  return {
    carrier: ShippingMethod.ECONT,
    id: '41',
    name: 'София',
    region: 'София',
    postCode: '1000',
    servingOfficeCode: null,
    ...overrides,
  }
}

const SOFIA_OFFICE = office({ code: '1', name: 'София Младост' })
const PLOVDIV_OFFICE = office({
  code: '2',
  name: 'Пловдив Център',
  placeId: '4000',
  latitude: 42.14,
  longitude: 24.75,
})
const OFFICES = [SOFIA_OFFICE, PLOVDIV_OFFICE]

const SOFIA = place({})
const PLOVDIV = place({ id: '4000', name: 'Пловдив', region: 'Пловдив', postCode: '4000' })
const PLACES = [SOFIA, PLOVDIV]

function renderScope(chosenCode: string | null = null) {
  return renderHook(() => usePlaceScope({ offices: OFFICES, places: PLACES, chosenCode }))
}

describe('usePlaceScope', () => {
  it('starts with nothing chosen', () => {
    const { result } = renderScope()

    expect(result.current).toMatchObject({ region: null, place: null, referencePoint: null })
  })

  it("starts in the chosen office's place, measured from the office", () => {
    const { result } = renderScope('2')

    expect(result.current).toMatchObject({
      region: 'Пловдив',
      place: PLOVDIV,
      referencePoint: { latitude: 42.14, longitude: 24.75, kind: 'chosen-office', label: 'Пловдив Център' },
    })
  })

  it('measures from a chosen place and takes its region', () => {
    const { result } = renderScope()

    act(() => result.current.choosePlace(PLOVDIV))

    expect(result.current).toMatchObject({
      region: 'Пловдив',
      place: PLOVDIV,
      referencePoint: { latitude: 42.14, longitude: 24.75, kind: 'place', label: 'Пловдив' },
    })
  })

  // Otherwise the next search would stay in a region the customer never chose.
  it('forgets a region filled in from the place once the place is cleared', () => {
    const { result } = renderScope()
    act(() => result.current.choosePlace(PLOVDIV))

    act(() => result.current.choosePlace(null))

    expect(result.current).toMatchObject({ region: null, place: null, referencePoint: null })
  })

  it('keeps a region the customer chose once the place is cleared', () => {
    const { result } = renderScope()
    act(() => result.current.chooseRegion('Пловдив'))
    act(() => result.current.choosePlace(PLOVDIV))

    act(() => result.current.choosePlace(null))

    expect(result.current.region).toBe('Пловдив')
  })

  it('forgets a region filled in by near me once the place is cleared', () => {
    const { result } = renderScope()
    act(() => result.current.chooseRegion('София'))
    act(() => result.current.sortNear({ latitude: 42.15, longitude: 24.74 }))

    act(() => result.current.choosePlace(null))

    expect(result.current.region).toBeNull()
  })

  it("forgets the chosen office's region once its place is cleared", () => {
    const { result } = renderScope('2')

    act(() => result.current.choosePlace(null))

    expect(result.current.region).toBeNull()
  })

  it('drops a place outside a newly chosen region', () => {
    const { result } = renderScope()
    act(() => result.current.choosePlace(PLOVDIV))

    act(() => result.current.chooseRegion('София'))

    expect(result.current).toMatchObject({ region: 'София', place: null, referencePoint: null })
  })

  it('keeps a place inside a newly chosen region', () => {
    const { result } = renderScope()
    act(() => result.current.choosePlace(PLOVDIV))

    act(() => result.current.chooseRegion('Пловдив'))

    expect(result.current.place).toBe(PLOVDIV)
  })

  it("measures from the customer and fills in the nearest office's place", () => {
    const { result } = renderScope()

    act(() => result.current.sortNear({ latitude: 42.15, longitude: 24.74 }))

    expect(result.current).toMatchObject({
      region: 'Пловдив',
      place: PLOVDIV,
      referencePoint: { latitude: 42.15, longitude: 24.74, kind: 'device', label: 'вас' },
    })
  })

  it('measures from the place again once the office or the customer is dropped', () => {
    const { result } = renderScope('2')

    act(() => result.current.dropReferencePoint())

    expect(result.current.referencePoint).toMatchObject({ kind: 'place', label: 'Пловдив' })
  })
})
