import { render, screen } from '@testing-library/react'
import { OrderConfirmationHero } from './order-confirmation-hero'
import { orderDetail } from './order-fixtures'

describe('OrderConfirmationHero', () => {
  it('thanks the customer by name', () => {
    render(<OrderConfirmationHero order={orderDetail()} />)

    expect(
      screen.getByRole('heading', { name: 'Благодарим, Иван! Поръчката е приета.' }),
    ).toBeInTheDocument()
  })

  it('names the order and when it was placed, in the shop timezone', () => {
    render(<OrderConfirmationHero order={orderDetail()} />)

    expect(screen.getByText('VP-ORD-000123')).toBeInTheDocument()
    expect(screen.getByText('16 октомври 2026 г. в 11:32')).toBeInTheDocument()
  })

  it('says where the confirmation goes', () => {
    render(<OrderConfirmationHero order={orderDetail()} />)

    expect(screen.getByText('ivan@example.bg')).toBeInTheDocument()
  })

  it('promises no email for an order placed without one', () => {
    const order = orderDetail()
    render(<OrderConfirmationHero order={{ ...order, contact: { ...order.contact, email: null } }} />)

    expect(screen.queryByText(/Потвърждението изпращаме/)).not.toBeInTheDocument()
  })

  it('leads back to the shop', () => {
    render(<OrderConfirmationHero order={orderDetail()} />)

    expect(screen.getByRole('link', { name: 'Продължете пазаруването' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})
