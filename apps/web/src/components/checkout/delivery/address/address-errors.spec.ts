import { addressErrors } from './address-errors'
import { EMPTY_ADDRESS_FORM, type AddressFormValues } from './address-form-values'

const place: AddressFormValues = { ...EMPTY_ADDRESS_FORM, city: 'София', postcode: '1303' }

describe('addressErrors', () => {
  it('has none for a street with its number', () => {
    expect(addressErrors({ ...place, street: 'бул. Витоша', streetNumber: '60' })).toEqual({})
  })

  it('has none for a quarter with a block', () => {
    expect(addressErrors({ ...place, quarter: 'Младост 1', block: '5' })).toEqual({})
  })

  it('asks for the number when only the street is filled', () => {
    expect(addressErrors({ ...place, street: 'бул. Витоша' })).toEqual({
      streetNumber: 'Въведи номер',
    })
  })

  it('asks for the street when only the number is filled', () => {
    expect(addressErrors({ ...place, streetNumber: '60' })).toEqual({
      street: 'Въведи улица',
    })
  })

  it('asks for where in the quarter when only the quarter is filled', () => {
    expect(addressErrors({ ...place, quarter: 'Младост 1', note: 'звънец' })).toEqual({
      block: 'Добави блок, вход, етаж или апартамент',
    })
  })

  it('asks for a street and number when nothing locates the door', () => {
    expect(addressErrors(place)).toEqual({ street: 'Въведи улица и номер' })
  })

  it('flags a missing city and a postcode that is not four digits', () => {
    expect(
      addressErrors({ ...EMPTY_ADDRESS_FORM, postcode: '13', street: 'a', streetNumber: '1' }),
    ).toEqual({ city: 'Въведи населено място', postcode: 'Въведи 4 цифри' })
  })
})
