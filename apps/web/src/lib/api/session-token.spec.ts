type SessionTokenModule = typeof import('./session-token')

/** The module keeps the session in module state, so each test loads a fresh copy. */
function loadModule(): SessionTokenModule {
  let loaded: SessionTokenModule | undefined

  jest.isolateModules(() => {
    loaded = jest.requireActual<SessionTokenModule>('./session-token')
  })

  return loaded as SessionTokenModule
}

afterEach(() => {
  jest.useRealTimers()
})

describe('the session token', () => {
  it('is read from the registered session', async () => {
    const { getSessionToken, registerSession } = loadModule()
    registerSession({ isSignedIn: true, getToken: () => Promise.resolve('jwt') })

    await expect(getSessionToken()).resolves.toBe('jwt')
  })

  it('is null for a signed-out visitor', async () => {
    const { getSessionToken, registerSession } = loadModule()
    registerSession({ isSignedIn: false, getToken: () => Promise.resolve(null) })

    await expect(getSessionToken()).resolves.toBeNull()
  })

  // A read made before Clerk has loaded would answer as a guest, and a
  // signed-in customer's cart would be painted empty.
  it('waits for the session to be registered', async () => {
    const { getSessionToken, registerSession } = loadModule()

    const token = getSessionToken()
    registerSession({ isSignedIn: true, getToken: () => Promise.resolve('jwt') })

    await expect(token).resolves.toBe('jwt')
  })

  it('gives up waiting and answers as a guest when Clerk never loads', async () => {
    jest.useFakeTimers()
    const { getSessionToken, SESSION_WAIT_MS } = loadModule()

    const token = getSessionToken()
    jest.advanceTimersByTime(SESSION_WAIT_MS)

    await expect(token).resolves.toBeNull()
  })

  it('follows the latest registration', async () => {
    const { getSessionToken, registerSession } = loadModule()
    registerSession({ isSignedIn: true, getToken: () => Promise.resolve('first') })
    registerSession({ isSignedIn: false, getToken: () => Promise.resolve(null) })

    await expect(getSessionToken()).resolves.toBeNull()
  })
})

describe('hasSession', () => {
  it('is false until a session is registered', () => {
    const { hasSession } = loadModule()

    expect(hasSession()).toBe(false)
  })

  it('says whether the registered session is signed in', () => {
    const { hasSession, registerSession } = loadModule()

    registerSession({ isSignedIn: true, getToken: () => Promise.resolve('jwt') })
    expect(hasSession()).toBe(true)

    registerSession({ isSignedIn: false, getToken: () => Promise.resolve(null) })
    expect(hasSession()).toBe(false)
  })
})
