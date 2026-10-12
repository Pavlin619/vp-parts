import { render } from '@testing-library/react'
import { useSessionSync } from '@/hooks/use-session-sync'
import { SessionSync } from './session-sync'

jest.mock('@/hooks/use-session-sync')

describe('SessionSync', () => {
  // Whatever the account needs is asked for in checkout's contact panel, not over the page.
  it('runs the session sync and renders nothing', () => {
    const { container } = render(<SessionSync />)

    expect(useSessionSync).toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  })
})
