import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { usePriceDisplay } from '@/hooks/use-price-display'
import { SearchVatToggle } from './search-vat-toggle'

describe('SearchVatToggle', () => {
  beforeEach(() => {
    usePriceDisplay.setState({ includesVat: true })
  })

  // Most visitors are consumers, and a net figure taken for the final one is a
  // price we quoted 20% under.
  it('starts on, so a price reads as the amount to be paid', () => {
    render(<SearchVatToggle />)

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('is labelled by the text beside it', () => {
    render(<SearchVatToggle />)

    expect(
      screen.getByRole('switch', { name: 'Цени с ДДС' }),
    ).toBeInTheDocument()
  })

  it('writes the choice to the shared preference', async () => {
    const user = userEvent.setup()
    render(<SearchVatToggle />)

    await user.click(screen.getByRole('switch'))

    expect(usePriceDisplay.getState().includesVat).toBe(false)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('switches back', async () => {
    const user = userEvent.setup()
    usePriceDisplay.setState({ includesVat: false })
    render(<SearchVatToggle />)

    await user.click(screen.getByRole('switch'))

    expect(usePriceDisplay.getState().includesVat).toBe(true)
  })
})
