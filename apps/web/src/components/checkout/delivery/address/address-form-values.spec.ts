import {
  EMPTY_ADDRESS_FORM,
  formatAddress,
  type AddressFormValues,
} from './address-form-values'

const streetAddress: AddressFormValues = {
  ...EMPTY_ADDRESS_FORM,
  city: 'София',
  postcode: '1303',
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
    expect(formatAddress({ ...EMPTY_ADDRESS_FORM, city: 'Варна', quarter: 'Чайка', block: '5', postcode: '9002' })).toBe(
      'Чайка, бл. 5, 9002 Варна',
    )
  })
})
