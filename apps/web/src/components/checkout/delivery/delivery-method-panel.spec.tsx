import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DeliveryPromise } from '@/lib/delivery/promise'
import { DeliveryMethodPanel } from './delivery-method-panel'

jest.mock('./address', () => ({
  AddressPicker: () => <div data-testid="address-picker" />,
}))

jest.mock('./offices', () => ({
  OfficePicker: ({ carrier }: { carrier: string }) => (
    <div data-testid="office-picker" data-carrier={carrier} />
  ),
}))

describe('DeliveryMethodPanel', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('offers the two courier methods and a store pickup for a retail order', () => {
    render(
      <DeliveryMethodPanel
        method="courier-address"
        onMethodChange={jest.fn()}
        promise={null}
      />,
    )

    const group = screen.getByRole('radiogroup', { name: 'Метод на доставка' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(
      screen.getByRole('radio', { name: /до адрес/ }),
    ).toBeChecked()
    expect(
      screen.getByRole('radio', { name: /до офис/ }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('radio', { name: /Вземане от магазин/ }),
    ).not.toBeChecked()
  })

  it('preselects no method and mounts no picker until one is picked', () => {
    render(<DeliveryMethodPanel method={null} onMethodChange={jest.fn()} promise={null} />)

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked()
    }
    expect(screen.queryByTestId('delivery-provider-slot')).not.toBeInTheDocument()
  })

  it('keeps its label id unique when rendered twice', () => {
    render(
      <>
        <DeliveryMethodPanel method="courier-address" onMethodChange={jest.fn()} promise={null} />
        <DeliveryMethodPanel method="courier-address" onMethodChange={jest.fn()} promise={null} />
      </>,
    )

    const [first, second] = screen.getAllByRole('radiogroup', { name: 'Метод на доставка' })
    expect(first.getAttribute('aria-labelledby')).not.toBe(second.getAttribute('aria-labelledby'))
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

  it("mounts the carrier's office picker under delivery to an office", () => {
    render(
      <DeliveryMethodPanel
        method="courier-office"
        onMethodChange={jest.fn()}
        promise={null}
      />,
    )

    expect(screen.getByTestId('office-picker')).toHaveAttribute('data-carrier', 'ECONT')
  })

  it('shows the address picker under delivery to an address', () => {
    render(
      <DeliveryMethodPanel
        method="courier-address"
        onMethodChange={jest.fn()}
        promise={null}
      />,
    )

    expect(screen.getByTestId('delivery-provider-slot')).toHaveAttribute(
      'data-method',
      'courier-address',
    )
    expect(screen.getByTestId('address-picker')).toBeInTheDocument()
    expect(screen.queryByTestId('office-picker')).not.toBeInTheDocument()
  })

  it('shows our one store, free of a delivery fee, under a store pickup', () => {
    render(
      <DeliveryMethodPanel
        method="store-pickup"
        onMethodChange={jest.fn()}
        promise={null}
      />,
    )

    const slot = screen.getByTestId('delivery-provider-slot')
    expect(slot).toHaveAttribute('data-method', 'store-pickup')
    expect(slot).toHaveTextContent('Магазин Плевен')
    expect(slot).toHaveTextContent(/без такса за доставка/i)
    expect(screen.queryByTestId('office-picker')).not.toBeInTheDocument()
    expect(screen.queryByTestId('address-picker')).not.toBeInTheDocument()
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
