import { ShippingMethod, type CustomerAddressInput } from '@vp-parts-shop/shared'
import {
  EMPTY_REGISTRATION,
  validateRegistration,
  type RegistrationValues,
} from './registration-values'

const filled: RegistrationValues = {
  firstName: ' Иван ',
  lastName: 'Петров',
  email: ' ivan@example.com ',
  password: 'correct horse',
  phoneNumber: '0888 123 456',
}

const address: CustomerAddressInput = {
  carrier: ShippingMethod.ECONT,
  placeId: '41',
  city: 'София',
  postCode: '1303',
  street: 'ул. Опълченска',
  streetNumber: '46',
}

describe('validateRegistration', () => {
  it('hands back what Clerk and the API take: trimmed, with the phone normalised', () => {
    expect(validateRegistration(filled)).toEqual({
      success: true,
      data: {
        firstName: 'Иван',
        lastName: 'Петров',
        email: 'ivan@example.com',
        password: 'correct horse',
        phoneNumber: '+359888123456',
      },
    })
  })

  it('carries the address when one was given', () => {
    const result = validateRegistration(filled, address)

    expect(result.success && result.data.address).toEqual(address)
  })

  it('names every empty field in Bulgarian', () => {
    expect(validateRegistration(EMPTY_REGISTRATION)).toEqual({
      success: false,
      errors: {
        firstName: 'Въведете име (без цифри)',
        lastName: 'Въведете фамилия (без цифри)',
        email: 'Въведете валиден имейл',
        password: 'Паролата трябва да е поне 8 символа.',
        phoneNumber: 'Въведете валиден мобилен номер',
      },
    })
  })

  it('refuses a name made of spaces or holding digits', () => {
    const result = validateRegistration({ ...filled, firstName: '   ', lastName: 'Петров2' })

    expect(result.success).toBe(false)
    expect(!result.success && Object.keys(result.errors)).toEqual(['firstName', 'lastName'])
  })

  it('refuses a landline, as the API would', () => {
    const result = validateRegistration({ ...filled, phoneNumber: '021234567' })

    expect(!result.success && result.errors).toEqual({
      phoneNumber: 'Въведете валиден мобилен номер',
    })
  })

  it('reports an address the shared schema refuses', () => {
    const result = validateRegistration(filled, { ...address, postCode: '13' })

    expect(!result.success && result.errors).toEqual({
      address: 'Проверете адреса за доставка',
    })
  })
})
