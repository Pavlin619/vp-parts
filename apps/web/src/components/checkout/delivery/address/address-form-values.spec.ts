import {
  ShippingMethod,
  customerAddressSchema,
  type DeliveryPlaceDto,
} from '@vp-parts-shop/shared'
import {
  EMPTY_ADDRESS_FORM,
  addressFormValuesOf,
  formatAddress,
  locatorModeOf,
  withLocatorMode,
  toCustomerAddress,
  toDeliveryAddress,
  type AddressFormValues,
} from './address-form-values'

const SOFIA: DeliveryPlaceDto = {
  carrier: ShippingMethod.ECONT,
  id: '41',
  name: 'София',
  region: 'София-град',
  postCode: '1303',
  servingOfficeCode: null,
}

const streetAddress: AddressFormValues = {
  ...EMPTY_ADDRESS_FORM,
  place: SOFIA,
  street: 'ул. Опълченска',
  streetNumber: '46',
}

describe('formatAddress', () => {
  it('writes the address on one line', () => {
    expect(formatAddress({ ...streetAddress, block: '3', entrance: 'Б', note: 'звънец' })).toBe(
      'ул. Опълченска 46, бл. 3, вх. Б, 1303 София',
    )
  })

  it('leaves out what was not filled', () => {
    const varna = { ...SOFIA, id: '7', name: 'Варна', postCode: '9002' }

    expect(
      formatAddress({ ...EMPTY_ADDRESS_FORM, place: varna, quarter: 'Чайка', block: '5' }),
    ).toBe('Чайка, бл. 5, 9002 Варна')
  })
})

describe('toDeliveryAddress', () => {
  it('keys the address by place and drops what is empty', () => {
    expect(toDeliveryAddress({ ...streetAddress, block: ' 3 ', note: '' })).toEqual({
      placeId: '41',
      street: 'ул. Опълченска',
      streetNumber: '46',
      block: '3',
    })
  })
})

describe('toCustomerAddress', () => {
  it('names the carrier and the place alongside the door, as a profile keeps it', () => {
    expect(toCustomerAddress({ ...streetAddress, note: ' звънец ' }, ShippingMethod.ECONT)).toEqual({
      carrier: ShippingMethod.ECONT,
      placeId: '41',
      city: 'София',
      postCode: '1303',
      street: 'ул. Опълченска',
      streetNumber: '46',
      note: 'звънец',
    })
  })

  it('passes the shared customer address schema', () => {
    const address = toCustomerAddress(streetAddress, ShippingMethod.ECONT)

    expect(customerAddressSchema.safeParse(address).success).toBe(true)
  })
})

describe('addressFormValuesOf', () => {
  it('fills the form back from an address and finds its place', () => {
    const address = toDeliveryAddress({ ...streetAddress, floor: '2', note: 'звънец' })

    expect(addressFormValuesOf(address, [SOFIA])).toEqual({
      ...streetAddress,
      floor: '2',
      note: 'звънец',
    })
  })

  it('leaves the place empty when the list no longer has it', () => {
    expect(addressFormValuesOf({ placeId: '999', street: 'a', streetNumber: '1' }, [SOFIA]).place)
      .toBeNull()
  })
})

describe('locator mode', () => {
  it('starts on the street, and on the quarter only when it is all there is', () => {
    expect(locatorModeOf(EMPTY_ADDRESS_FORM)).toBe('street')
    expect(locatorModeOf({ ...EMPTY_ADDRESS_FORM, quarter: 'Младост 1' })).toBe('quarter')
    expect(locatorModeOf({ ...streetAddress, quarter: 'Младост 1' })).toBe('street')
  })

  it('starts the door over when switching, keeping the place and the note', () => {
    const filled = {
      ...streetAddress,
      quarter: 'Младост 1',
      block: '5',
      entrance: 'Б',
      floor: '2',
      apartment: '12',
      note: 'звънец',
    }

    expect(withLocatorMode(filled)).toEqual({
      ...EMPTY_ADDRESS_FORM,
      place: SOFIA,
      note: 'звънец',
    })
  })
})
