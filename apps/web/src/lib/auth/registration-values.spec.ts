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

})
