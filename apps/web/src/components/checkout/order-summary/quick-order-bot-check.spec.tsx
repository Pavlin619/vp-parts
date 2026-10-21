import type { Ref } from 'react'
import { act, render, screen } from '@testing-library/react'
import type { TurnstileInstance, TurnstileProps } from '@marsidev/react-turnstile'
import { useQuickOrder } from '@/hooks/use-quick-order'
import { QuickOrderBotCheck } from './quick-order-bot-check'

let widget: TurnstileProps
const execute = jest.fn()
const reset = jest.fn()

jest.mock('@marsidev/react-turnstile', () => {
  const { useImperativeHandle } = jest.requireActual<typeof import('react')>('react')

  return {
    Turnstile: ({ ref, ...props }: TurnstileProps & { ref?: Ref<Partial<TurnstileInstance>> }) => {
      widget = props
      useImperativeHandle(ref, () => ({ execute, reset }))

      return <div data-testid="turnstile" />
    },
  }
})

beforeEach(() => {
  execute.mockReset()
  reset.mockReset()
  useQuickOrder.setState({ botCheck: { solve: null, hasFailed: false } })
})

function renderLoaded() {
  const view = render(<QuickOrderBotCheck />)
  act(() => widget.onWidgetLoad?.('widget-1'))

  return view
}

describe('QuickOrderBotCheck', () => {
  // The visible test key marks itself "for testing only"; nothing should be drawn unasked.
  it('renders Cloudflare’s widget unseen, to run only when the order is placed', () => {
    render(<QuickOrderBotCheck />)

    expect(widget.siteKey).toBe('1x00000000000000000000BB')
    expect(widget.options).toMatchObject({
      execution: 'execute',
      appearance: 'interaction-only',
      language: 'bg',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('offers no way to order until Cloudflare has loaded', () => {
    render(<QuickOrderBotCheck />)

    expect(useQuickOrder.getState().botCheck.solve).toBeNull()
  })

  it('runs the challenge when asked, answering its token', async () => {
    renderLoaded()

    const token = useQuickOrder.getState().botCheck.solve!()
    act(() => widget.onSuccess?.('token-1'))

    await expect(token).resolves.toBe('token-1')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it.each<[string, (props: TurnstileProps) => void]>([
    ['the challenge fails', (props) => props.onError?.('300010')],
    ['the browser is not supported', (props) => props.onUnsupported?.()],
    ['the visitor never ticks the box', (props) => props.onTimeout?.()],
  ])('fails the attempt and offers the account when %s', async (_, fail) => {
    renderLoaded()

    const token = useQuickOrder.getState().botCheck.solve!()
    act(() => fail(widget))

    await expect(token).rejects.toThrow()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не успяхме да потвърдим, че поръчката не е от робот.',
    )
  })

  it('offers the account when Cloudflare’s script cannot load', () => {
    render(<QuickOrderBotCheck />)

    act(() => widget.scriptOptions?.onError?.())

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('withdraws the solver once it is gone', () => {
    const { unmount } = renderLoaded()

    unmount()

    expect(useQuickOrder.getState().botCheck.solve).toBeNull()
  })
})
