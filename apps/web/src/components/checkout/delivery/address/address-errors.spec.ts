import { addressErrors } from './address-errors'
import { ShippingMethod } from '@vp-parts-shop/shared'
import { EMPTY_ADDRESS_FORM, type AddressFormValues } from './address-form-values'

const place: AddressFormValues = {
  ...EMPTY_ADDRESS_FORM,
  place: {
    carrier: ShippingMethod.ECONT,
    id: '41',
    name: 'София',
    region: 'София-град',
    postCode: '1303',
    servingOfficeCode: null,
  },
}

describe('addressErrors', () => {
  describe('by street', () => {
    it('has none for a street with its number', () => {
      expect(addressErrors({ ...place, street: 'бул. Витоша', streetNumber: '60' }, 'street')).toEqual({})
    })

    it('asks for the number when only the street is filled', () => {
      expect(addressErrors({ ...place, street: 'бул. Витоша' }, 'street')).toEqual({
        streetNumber: 'Въведи номер',
      })
    })

    it('asks for the street when only the number is filled', () => {
      expect(addressErrors({ ...place, streetNumber: '60' }, 'street')).toEqual({
        street: 'Въведи улица',
      })
    })

    it('asks for both when nothing is filled', () => {
      expect(addressErrors(place, 'street')).toEqual({
        street: 'Въведи улица',
        streetNumber: 'Въведи номер',
      })
    })
  })

  describe('by quarter', () => {
    it('has none for a quarter with a block', () => {
      expect(addressErrors({ ...place, quarter: 'Младост 1', block: '5' }, 'quarter')).toEqual({})
    })

    it('takes an apartment as where in the quarter', () => {
      expect(addressErrors({ ...place, quarter: 'Младост 1', apartment: '12' }, 'quarter')).toEqual({})
    })

    it('asks for where in the quarter when only the quarter is filled', () => {
      expect(addressErrors({ ...place, quarter: 'Младост 1', note: 'звънец' }, 'quarter')).toEqual({
        block: 'Добави блок, вход, етаж или апартамент',
      })
    })

    it('asks for the quarter when only where in it is filled', () => {
      expect(addressErrors({ ...place, block: '5' }, 'quarter')).toEqual({
        quarter: 'Въведи квартал или ж.к.',
      })
    })
  })

  it('asks for a place from the list when none is chosen', () => {
    expect(
      addressErrors({ ...EMPTY_ADDRESS_FORM, street: 'a', streetNumber: '1' }, 'street'),
    ).toEqual({ place: 'Избери населено място от списъка' })
  })
})
