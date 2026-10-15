import { render, screen } from '@testing-library/react'
import { StorePickupCard } from './store-pickup-card'

describe('StorePickupCard', () => {
  it('names the one store a customer collects from, with its address, hours and phone', () => {
    render(<StorePickupCard />)

    expect(screen.getByText('Магазин Плевен')).toBeInTheDocument()
    expect(screen.getByText(/ул\. Полтава 19/)).toBeInTheDocument()
    expect(screen.getByText(/5809 Плевен/)).toBeInTheDocument()
    expect(screen.getByText('Пон–Пет 9:00–18:00 · Съб 9:00–14:00')).toBeInTheDocument()
    expect(screen.getByText('+359 88 8336843')).toBeInTheDocument()
  })

  it('tells the customer a pickup carries no delivery fee', () => {
    render(<StorePickupCard />)

    expect(screen.getByText(/без такса за доставка/i)).toBeInTheDocument()
  })
})
