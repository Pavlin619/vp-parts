import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CartAvailabilityError } from './cart-availability-error'

const UNLOADED_TITLE = 'В момента не можем да заредим цените и наличностите на поръчката.'

describe('CartAvailabilityError', () => {
  it('says the figures are missing when none were ever read', () => {
    render(
      <CartAvailabilityError
        hasPrices={false}
        unloadedTitle={UNLOADED_TITLE}
        onRetry={jest.fn()}
      />,
    )

    expect(screen.getByText(UNLOADED_TITLE)).toBeInTheDocument()
  })

  it('says the figures on screen may be stale when a re-read failed', () => {
    render(
      <CartAvailabilityError hasPrices unloadedTitle={UNLOADED_TITLE} onRetry={jest.fn()} />,
    )

    expect(
      screen.getByText('Показаните цени и наличности може да не са актуални.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(UNLOADED_TITLE)).not.toBeInTheDocument()
  })

  it('retries the read', async () => {
    const user = userEvent.setup()
    const onRetry = jest.fn()
    render(
      <CartAvailabilityError hasPrices unloadedTitle={UNLOADED_TITLE} onRetry={onRetry} />,
    )

    await user.click(screen.getByRole('button'))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
