import { contactNameError, contactPhoneError } from './contact-modes'

describe('contactNameError', () => {
  it('asks for a name shorter than three characters once trimmed', () => {
    expect(contactNameError('')).toBe('Въведете име и фамилия')
    expect(contactNameError('  Ив  ')).toBe('Въведете име и фамилия')
  })

  it('accepts a full name', () => {
    expect(contactNameError('Иван Петров')).toBeUndefined()
  })
})

describe('contactPhoneError', () => {
  it('rejects a number with fewer than nine digits', () => {
    expect(contactPhoneError('')).toBe('Въведете валиден телефонен номер')
    expect(contactPhoneError('+359 88')).toBe('Въведете валиден телефонен номер')
  })

  it('counts only the digits, ignoring spaces and the plus sign', () => {
    expect(contactPhoneError('+359 88 123 4567')).toBeUndefined()
    expect(contactPhoneError('0881234567')).toBeUndefined()
  })
})
