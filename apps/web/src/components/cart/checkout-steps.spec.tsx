import { render, screen } from '@testing-library/react'
import { CheckoutSteps } from './checkout-steps'

describe('CheckoutSteps', () => {
  it('marks the step the page is on', () => {
    render(<CheckoutSteps current={1} />)

    expect(screen.getByText('Кошница')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Доставка и плащане')).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('lists the steps still ahead', () => {
    render(<CheckoutSteps current={1} />)

    expect(screen.getByText('Потвърждение')).toBeInTheDocument()
  })

  // The indicator is a map, not a menu: a step is reached by finishing the one
  // before it, so nothing here is clickable.
  it('offers no way to skip ahead', () => {
    render(<CheckoutSteps current={1} />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
