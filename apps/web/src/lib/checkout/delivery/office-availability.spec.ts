import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
  type ParcelEstimateDto,
} from '@vp-parts-shop/shared'
import {
  officeAvailability,
  resolveSelectedOffice,
  type ParcelCheck,
} from './office-availability'

function office(overrides: Partial<DeliveryOfficeDto>): DeliveryOfficeDto {
  return {
    carrier: ShippingMethod.ECONT,
    code: '1000',
    name: 'Офис',
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

function ready(overrides: Partial<ParcelEstimateDto> = {}): ParcelCheck {
  return {
    state: 'ready',
    parcel: {
      weightGrams: 1200,
      unmeasuredArticles: [],
      isLockerEligible: true,
      ...overrides,
    },
  }
}

const OFFICE = office({ code: '1' })
const LOCKER = office({ code: '2', type: DeliveryOfficeType.LOCKER })

describe('officeAvailability', () => {
  // A staffed office takes any parcel, even one we could not weigh.
  it('always lets a staffed office be chosen', () => {
    expect(officeAvailability(OFFICE, { state: 'checking' })).toEqual({
      isSelectable: true,
    })
    expect(officeAvailability(OFFICE, { state: 'failed' })).toEqual({
      isSelectable: true,
    })
    expect(
      officeAvailability(OFFICE, ready({ isLockerEligible: false })),
    ).toEqual({ isSelectable: true })
  })

  it('lets a locker be chosen once the parcel is known to fit', () => {
    expect(officeAvailability(LOCKER, ready())).toEqual({ isSelectable: true })
  })

  it('holds a locker back while the parcel is being weighed', () => {
    expect(officeAvailability(LOCKER, { state: 'checking' })).toEqual({
      isSelectable: false,
      reason: 'PARCEL_CHECKING',
    })
  })

  it('holds a locker back when the parcel could not be weighed', () => {
    expect(officeAvailability(LOCKER, { state: 'failed' })).toEqual({
      isSelectable: false,
      reason: 'PARCEL_CHECK_FAILED',
    })
  })

  it('refuses a locker the parcel does not fit', () => {
    expect(
      officeAvailability(LOCKER, ready({ isLockerEligible: false })),
    ).toEqual({ isSelectable: false, reason: 'PARCEL_NOT_LOCKER_ELIGIBLE' })
  })
})

describe('resolveSelectedOffice', () => {
  const offices = [OFFICE, LOCKER]

  it('finds the remembered office in the current list', () => {
    expect(resolveSelectedOffice(offices, '1', ready())).toBe(OFFICE)
  })

  it('forgets nothing when nothing was remembered', () => {
    expect(resolveSelectedOffice(offices, null, ready())).toBeNull()
  })

  // Econt closes offices; a code saved last month may name none.
  it('drops a remembered office the carrier no longer lists', () => {
    expect(resolveSelectedOffice(offices, '999', ready())).toBeNull()
  })

  it('drops a remembered locker the parcel no longer fits', () => {
    expect(
      resolveSelectedOffice(offices, '2', ready({ isLockerEligible: false })),
    ).toBeNull()
  })

  // Otherwise the chosen locker would blink out and back while the cart is re-weighed.
  it('keeps a remembered locker while the parcel is being weighed', () => {
    expect(resolveSelectedOffice(offices, '2', { state: 'checking' })).toBe(LOCKER)
  })
})
