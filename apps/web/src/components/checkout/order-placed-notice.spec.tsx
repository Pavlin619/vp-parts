import { render, screen } from '@testing-library/react'
import { OrderPlacedNotice } from './order-placed-notice'

describe('OrderPlacedNotice', () => {
  it('announces the accepted order while its confirmation opens', () => {
    render(<OrderPlacedNotice />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Поръчката е приета')
    expect(status).toHaveTextContent('Потвърждаваме я…')
  })
})
