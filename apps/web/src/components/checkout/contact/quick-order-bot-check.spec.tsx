import { act, render, screen } from '@testing-library/react'
import type { TurnstileProps } from '@marsidev/react-turnstile'
import { useQuickOrder } from '@/hooks/use-quick-order'
import { QuickOrderBotCheck } from './quick-order-bot-check'

let widget: TurnstileProps
let mounts: number

jest.mock('@marsidev/react-turnstile', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react')

  return {
    Turnstile: (props: TurnstileProps) => {
      widget = props
      useEffect(() => {
        mounts += 1
      }, [])

      return <div data-testid="turnstile" />
    },
  }
})

beforeEach(() => {
  mounts = 0
  useQuickOrder.getState().reset()
})

describe('QuickOrderBotCheck', () => {
  it('renders Cloudflare’s widget in Bulgarian, as wide as the form', () => {
    render(<QuickOrderBotCheck />)

    expect(screen.getByTestId('turnstile')).toBeInTheDocument()
    expect(widget.siteKey).toBe('1x00000000000000000000AA')
    expect(widget.options).toMatchObject({ language: 'bg', size: 'flexible', theme: 'light' })
  })

  it('hands the token it solves to the order', () => {
    render(<QuickOrderBotCheck />)

    act(() => widget.onSuccess?.('token-1'))

    expect(useQuickOrder.getState().botCheck.token).toBe('token-1')
  })

  it('drops a token once it expires', () => {
    render(<QuickOrderBotCheck />)
    act(() => widget.onSuccess?.('token-1'))

    act(() => widget.onExpire?.('token-1'))

    expect(useQuickOrder.getState().botCheck.token).toBeNull()
  })

  it.each<[string, (props: TurnstileProps) => void]>([
    ['the challenge fails', (props) => props.onError?.('300010')],
    ['the browser is not supported', (props) => props.onUnsupported?.()],
    ['Cloudflare’s script cannot load', (props) => props.scriptOptions?.onError?.()],
  ])('offers the account instead when %s', (_, fail) => {
    render(<QuickOrderBotCheck />)

    act(() => fail(widget))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не успяхме да потвърдим, че поръчката не е от робот.',
    )
    expect(useQuickOrder.getState().botCheck.token).toBeNull()
  })

  it('takes the failure back once a later attempt passes', () => {
    render(<QuickOrderBotCheck />)
    act(() => widget.onError?.('300010'))

    act(() => widget.onSuccess?.('token-2'))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('starts a fresh challenge once the order has spent its token', () => {
    render(<QuickOrderBotCheck />)
    act(() => widget.onSuccess?.('token-1'))

    act(() => useQuickOrder.getState().spendBotCheck())

    expect(mounts).toBe(2)
  })
})
