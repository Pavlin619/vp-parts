import { BotCheckChallenge, BotCheckFailedError } from './bot-check-challenge'

const TIMEOUT_MS = 1000

describe('BotCheckChallenge', () => {
  const widget = { execute: jest.fn(), reset: jest.fn() }
  let challenge: BotCheckChallenge

  beforeEach(() => {
    jest.useFakeTimers()
    widget.execute.mockReset()
    widget.reset.mockReset()
    challenge = new BotCheckChallenge(widget, TIMEOUT_MS)
  })

  afterEach(() => jest.useRealTimers())

  it('runs the challenge only when asked, answering the token the widget hands back', async () => {
    expect(widget.execute).not.toHaveBeenCalled()

    const token = challenge.solve()
    challenge.pass('token-1')

    await expect(token).resolves.toBe('token-1')
    expect(widget.execute).toHaveBeenCalledTimes(1)
    expect(widget.reset).not.toHaveBeenCalled()
  })

  // Cloudflare accepts a token once, so the next attempt needs a challenge of its own.
  it('resets the widget before every later attempt', async () => {
    const first = challenge.solve()
    challenge.pass('token-1')
    await first

    const second = challenge.solve()
    challenge.pass('token-2')

    await expect(second).resolves.toBe('token-2')
    expect(widget.reset).toHaveBeenCalledTimes(1)
    expect(widget.reset.mock.invocationCallOrder[0]).toBeLessThan(
      widget.execute.mock.invocationCallOrder[1],
    )
  })

  it('fails when the widget fails', async () => {
    const token = challenge.solve()

    challenge.fail()

    await expect(token).rejects.toBeInstanceOf(BotCheckFailedError)
  })

  it('fails once the visitor leaves Cloudflare’s box unticked for too long', async () => {
    const token = challenge.solve()

    jest.advanceTimersByTime(TIMEOUT_MS)

    await expect(token).rejects.toBeInstanceOf(BotCheckFailedError)
  })

  it('ignores a token that arrives with no attempt waiting', () => {
    expect(() => challenge.pass('stray')).not.toThrow()
  })
})
