import { render, screen } from '@testing-library/react'
import { OrderStatus } from '@vp-parts-shop/shared'
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

  describe('an order waiting on a confirmation call', () => {
    const awaitingCall = (email: string | null) => {
      const order = orderDetail()

      return {
        ...order,
        status: OrderStatus.AWAITING_CONFIRMATION,
        contact: { ...order.contact, email },
      }
    }

    it('says the office will call the phone given to confirm it', () => {
      render(<OrderConfirmationHero order={awaitingCall(null)} />)

      expect(screen.getByText(/Ще ви се обадим на/)).toHaveTextContent(
        'Ще ви се обадим на +359888123456, за да потвърдим поръчката.',
      )
    })

    // A guest's email is unverified, so nothing is sent to it until the call.
    it('promises no email before the call, even to an email given', () => {
      render(<OrderConfirmationHero order={awaitingCall('maria@example.com')} />)

      expect(screen.queryByText(/Потвърждението изпращаме/)).not.toBeInTheDocument()
    })
  })

  it('promises no call for an order already being prepared', () => {
    render(<OrderConfirmationHero order={orderDetail()} />)

    expect(screen.queryByText(/Ще ви се обадим/)).not.toBeInTheDocument()
  })

  it('leads back to the shop', () => {
    render(<OrderConfirmationHero order={orderDetail()} />)

    expect(screen.getByRole('link', { name: 'Продължете пазаруването' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})
