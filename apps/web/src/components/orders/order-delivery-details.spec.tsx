import { render, screen } from '@testing-library/react'
import { DeliveryMethod, PaymentMethod, ShippingMethod } from '@vp-parts-shop/shared'
import { OrderDeliveryDetails } from './order-delivery-details'
import { orderDetail } from './order-fixtures'

describe('OrderDeliveryDetails', () => {
  it('names the office and when the parcel is expected', () => {
    render(<OrderDeliveryDetails order={orderDetail()} />)

    expect(screen.getByText('Доставка до офис')).toBeInTheDocument()
    expect(screen.getByText('Еконт София Център')).toBeInTheDocument()
    expect(screen.getByText('ул. Пиротска 5')).toBeInTheDocument()
    expect(screen.getByTestId('carrier-mark')).toHaveTextContent('E')
    expect(screen.getByText('Очаквана доставка').nextSibling).toHaveTextContent(
      'пн, 19 октомври',
    )
  })

  it('reads the address back on one line, with the note for the courier', () => {
    render(
      <OrderDeliveryDetails
        order={orderDetail({
          delivery: {
            method: DeliveryMethod.COURIER_ADDRESS,
            carrier: ShippingMethod.ECONT,
            address: {
              placeId: '41',
              city: 'София',
              postCode: '1303',
              street: 'ул. Опълченска',
              streetNumber: '46',
              block: '3',
              note: 'Звънец 3',
            },
            expectedDeliveryDate: null,
          },
        })}
      />,
    )

    expect(screen.getByText('Доставка до адрес')).toBeInTheDocument()
    expect(screen.getByText('ул. Опълченска 46, бл. 3, 1303 София')).toBeInTheDocument()
    expect(screen.getByText('Звънец 3')).toBeInTheDocument()
    expect(screen.queryByText('Очаквана доставка')).not.toBeInTheDocument()
  })

  it('says a store pickup is collected and paid at our store', () => {
    render(
      <OrderDeliveryDetails
        order={orderDetail({
          delivery: { method: DeliveryMethod.STORE_PICKUP, expectedDeliveryDate: '2026-09-30' },
        })}
      />,
    )

    expect(screen.getByText('Вземане от магазина')).toBeInTheDocument()
    expect(screen.getByText('Готова за вземане').nextSibling).toHaveTextContent(
      'ср, 30 септември',
    )
    expect(screen.getByText('Плаща се в магазина')).toBeInTheDocument()
    expect(screen.queryByTestId('carrier-mark')).not.toBeInTheDocument()
  })

  it("gives the office's working hours", () => {
    render(<OrderDeliveryDetails order={orderDetail()} />)

    expect(screen.getByText('Пн–Пт 09:00–18:00 · Сб 10:00–14:00')).toBeInTheDocument()
  })

  it('leaves the hours out for an office that publishes none', () => {
    render(
      <OrderDeliveryDetails
        order={orderDetail({
          delivery: {
            method: DeliveryMethod.COURIER_OFFICE,
            carrier: ShippingMethod.ECONT,
            office: {
              code: '1127',
              name: 'Еконт София Център',
              address: 'ул. Пиротска 5',
              weekdayHours: null,
              saturdayHours: null,
            },
            expectedDeliveryDate: null,
          },
        })}
      />,
    )

    expect(screen.queryByText(/Пн–Пт/)).not.toBeInTheDocument()
  })

  it('names who receives the order', () => {
    render(<OrderDeliveryDetails order={orderDetail()} />)

    expect(screen.getByText('Иван Петров')).toBeInTheDocument()
    expect(screen.getByText('+359888123456')).toBeInTheDocument()
    expect(screen.getByText('ivan@example.bg')).toBeInTheDocument()
  })

  it('says cash on delivery is paid on receipt', () => {
    render(<OrderDeliveryDetails order={orderDetail()} />)

    expect(screen.getByText('Наложен платеж')).toBeInTheDocument()
    expect(screen.getByText('Плаща се при получаване')).toBeInTheDocument()
  })

  it('claims no collection for an order paid by card', () => {
    render(
      <OrderDeliveryDetails order={orderDetail({ paymentMethod: PaymentMethod.CARD })} />,
    )

    expect(screen.getByText('Плащане с карта')).toBeInTheDocument()
    expect(screen.queryByText('Плаща се при получаване')).not.toBeInTheDocument()
  })
})
