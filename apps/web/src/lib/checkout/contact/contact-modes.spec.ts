import { CONTACT_MODES, initialContactMode } from './contact-modes'

describe('CONTACT_MODES', () => {
  it('offers sign-in, registration and a quick order', () => {
    expect(CONTACT_MODES.map((mode) => mode.id)).toEqual(['login', 'register', 'quick'])
  })
})

describe('initialContactMode', () => {
  it('leaves the choice to the visitor', () => {
    expect(initialContactMode('')).toBeNull()
  })

  // Only the "Вход" tab mounts Clerk's <SignIn/>, which finishes the callback.
  it.each(['#/sso-callback', '#/sso-callback?state=x', '#/continue'])(
    'opens the sign-in tab when Clerk returns to a route of its own (%s)',
    (hash) => {
      expect(initialContactMode(hash)).toBe('login')
    },
  )

  it('ignores an ordinary in-page anchor', () => {
    expect(initialContactMode('#delivery')).toBeNull()
  })
})
