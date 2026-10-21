import {
  EMPTY_QUICK_ORDER_CONTACT,
  validateQuickOrderContact,
  type QuickOrderContactValues,
} from './quick-order-contact'

const VALID: QuickOrderContactValues = {
  firstName: 'Мария',
  lastName: 'Иванова',
  phoneNumber: '0888 765 432',
  email: '',
}

describe('validateQuickOrderContact', () => {
  it('accepts two names and a mobile, leaving out an email not given', () => {
    expect(validateQuickOrderContact(VALID)).toEqual({
      success: true,
      data: { firstName: 'Мария', lastName: 'Иванова', phoneNumber: '+359888765432' },
    })
  })

  it('trims the names and the email', () => {
    const result = validateQuickOrderContact({
      ...VALID,
      firstName: ' Мария ',
      lastName: 'Иванова ',
      email: ' maria@example.com ',
    })

    expect(result).toEqual({
      success: true,
      data: {
        firstName: 'Мария',
        lastName: 'Иванова',
        phoneNumber: '+359888765432',
        email: 'maria@example.com',
      },
    })
  })

  it('names every field that is wrong, with the words registration uses', () => {
    expect(
      validateQuickOrderContact({
        firstName: '',
        lastName: 'Иванова2',
        phoneNumber: '02 987 6543',
        email: 'maria@',
      }),
    ).toEqual({
      success: false,
      errors: {
        firstName: 'Въведете име (без цифри)',
        lastName: 'Въведете фамилия (без цифри)',
        phoneNumber: 'Въведете валиден мобилен номер',
        email: 'Въведете валиден имейл',
      },
    })
  })

  it('refuses an empty form', () => {
    const result = validateQuickOrderContact(EMPTY_QUICK_ORDER_CONTACT)

    expect(result.success).toBe(false)
    expect(result.success === false && Object.keys(result.errors).sort()).toEqual([
      'firstName',
      'lastName',
      'phoneNumber',
    ])
  })
})
