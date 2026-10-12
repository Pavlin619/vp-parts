import {
  contactNameError,
  contactPhoneError,
  DEFAULT_CONTACT_MODE,
  initialContactMode,
} from './contact-modes'

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
  it('accepts a Bulgarian mobile in national or international form', () => {
    expect(contactPhoneError('0888123456')).toBeUndefined()
    expect(contactPhoneError('+359 88 123 4567')).toBeUndefined()
  })

  it('refuses an empty or truncated number', () => {
    expect(contactPhoneError('')).toBe('Въведете валиден мобилен номер')
    expect(contactPhoneError('+359 88')).toBe('Въведете валиден мобилен номер')
  })

  it('refuses a landline', () => {
    expect(contactPhoneError('021234567')).toBe('Въведете валиден мобилен номер')
  })

  it('refuses a foreign mobile', () => {
    expect(contactPhoneError('+44 7700 900123')).toBe('Въведете валиден мобилен номер')
  })
})

describe('initialContactMode', () => {
  it('starts a visitor on the default mode', () => {
    expect(initialContactMode('')).toBe(DEFAULT_CONTACT_MODE)
  })

  // Only the "Вход" tab mounts Clerk's <SignIn/>, which finishes the callback.
  it.each(['#/sso-callback', '#/sso-callback?state=x', '#/continue'])(
    'opens the sign-in tab when Clerk returns to a route of its own (%s)',
    (hash) => {
      expect(initialContactMode(hash)).toBe('login')
    },
  )

  it('ignores an ordinary in-page anchor', () => {
    expect(initialContactMode('#delivery')).toBe(DEFAULT_CONTACT_MODE)
  })
})
