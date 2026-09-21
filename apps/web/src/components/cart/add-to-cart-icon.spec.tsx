import { render, screen } from '@testing-library/react'
import { AddToCartIcon } from './add-to-cart-icon'

describe('AddToCartIcon', () => {
  it('shows a spinner while the write is in flight', () => {
    render(<AddToCartIcon isAdding className="h-4 w-4" />)

    expect(screen.getByTestId('add-to-cart-icon-spinner')).toBeInTheDocument()
  })

  it('shows the cart icon otherwise', () => {
    render(<AddToCartIcon isAdding={false} className="h-4 w-4" />)

    expect(screen.getByTestId('add-to-cart-icon-cart')).toBeInTheDocument()
  })
})
