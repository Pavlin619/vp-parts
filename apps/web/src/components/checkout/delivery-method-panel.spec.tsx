import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DeliveryPromise } from '@/lib/delivery/promise'
import { DeliveryMethodPanel } from './delivery-method-panel'

describe('DeliveryMethodPanel', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('offers only the two courier methods for a retail order', () => {
    render(
      <DeliveryMethodPanel
        method="courier-address"
        onMethodChange={jest.fn()}
        promise={null}
      />,
    )

    const group = screen.getByRole('radiogroup', { name: 'Метод на доставка' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(
      screen.getByRole('radio', { name: /до адрес/ }),
    ).toBeChecked()
    expect(
      screen.getByRole('radio', { name: /до офис/ }),
    ).not.toBeChecked()
  })

  it('reports the method the customer picks', async () => {
    const user = userEvent.setup()
    const onMethodChange = jest.fn()
    render(
      <DeliveryMethodPanel
        method="courier-address"
        onMethodChange={onMethodChange}
        promise={null}
      />,
    )

    await user.click(screen.getByRole('radio', { name: /до офис/ }))

    expect(onMethodChange).toHaveBeenCalledWith('courier-office')
  })

  // The carrier's own address or office picker mounts here later.
  it('keeps a slot for the provider under the selected method', () => {
    render(
      <DeliveryMethodPanel
        method="courier-office"
        onMethodChange={jest.fn()}
        promise={null}
      />,
    )

    expect(screen.getByTestId('delivery-provider-slot')).toHaveAttribute(
      'data-method',
      'courier-office',
    )
  })

  it('prompts to order before the courier deadline', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-07-01T08:00:00.000Z'))

    const promise: DeliveryPromise = {
      cutoffAt: '2026-07-01T08:45:00.000Z',
      orderCutoffTime: '11:00',
      warehouseName: 'Централен склад',
      fulfilledAt: '2026-07-02T06:00:00.000Z',
      isPickup: false,
    }

    render(
      <DeliveryMethodPanel
        method="courier-address"
        onMethodChange={jest.fn()}
        promise={promise}
      />,
    )

    expect(screen.getByTestId('delivery-cutoff-promise')).toHaveTextContent(
      /Да пристигне/,
    )
  })
})
