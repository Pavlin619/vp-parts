import { render, screen } from '@testing-library/react'
import { DeliveryMethod } from '@vp-parts-shop/shared'
import { orderDetail } from './order-fixtures'
import { OrderMoneySummary } from './order-money-summary'

describe('OrderMoneySummary', () => {
  it('shows the parts, the delivery, the fee and the total with the VAT in it', () => {
    render(<OrderMoneySummary order={orderDetail()} />)

    expect(screen.getByText('Продукти').nextSibling).toHaveTextContent('48,45 €')
    expect(screen.getByText('Доставка').nextSibling).toHaveTextContent('3,78 €')
    expect(screen.getByText('Такса наложен платеж').nextSibling).toHaveTextContent('0,81 €')
    expect(screen.getByText('Общо с ДДС').nextSibling).toHaveTextContent('53,04 €')
    expect(screen.getByText('в т.ч. ДДС').nextSibling).toHaveTextContent('8,84 €')
    expect(screen.getByText('Сума без ДДС').nextSibling).toHaveTextContent('44,20 €')
  })

  it('asks for the total at the door', () => {
    render(<OrderMoneySummary order={orderDetail()} />)

    expect(screen.getByText('Платете 53,04 € при получаване')).toBeInTheDocument()
  })

  it('charges nothing for a store pickup, paid at the counter', () => {
    render(
      <OrderMoneySummary
        order={orderDetail({
          delivery: { method: DeliveryMethod.STORE_PICKUP, expectedDeliveryDate: null },
          deliveryPrice: 0,
          cashOnDeliveryFee: 0,
          total: 4845,
        })}
      />,
    )

    expect(screen.getByText('Доставка').nextSibling).toHaveTextContent('Безплатна')
    expect(screen.queryByText('Такса наложен платеж')).not.toBeInTheDocument()
    expect(screen.getByText('Платете 48,45 € при вземане от магазина')).toBeInTheDocument()
  })
})
