import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCart } from '@/hooks/use-cart'
import { CartWriteErrorBanner } from './cart-write-error'

describe('CartWriteErrorBanner', () => {
  beforeEach(() => {
    useCart.setState({ lastWriteError: null })
  })

  it('renders nothing while no write has failed', () => {
    render(<CartWriteErrorBanner />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says the cart was full when a refused add is the reason', () => {
    useCart.setState({ lastWriteError: { code: 'CART_FULL' } })

    render(<CartWriteErrorBanner />)

    expect(
      screen.getByText('Кошницата е пълна — този артикул не беше добавен.'),
    ).toBeInTheDocument()
  })

  it('says the line is gone when the server no longer holds it', () => {
    useCart.setState({ lastWriteError: { code: 'CART_ITEM_NOT_FOUND' } })

    render(<CartWriteErrorBanner />)

    expect(
      screen.getByText('Артикулът вече не е в кошницата — списъкът е обновен.'),
    ).toBeInTheDocument()
  })

  it('falls back to a generic message for every other failure', () => {
    useCart.setState({ lastWriteError: { code: 'OFFLINE' } })

    render(<CartWriteErrorBanner />)

    expect(
      screen.getByText('Промяната не бе запазена. Проверете връзката си.'),
    ).toBeInTheDocument()
  })

  it('says the cart could not be synced when the background read failed', () => {
    useCart.setState({ lastWriteError: { code: 'SYNC_FAILED' } })

    render(<CartWriteErrorBanner />)

    expect(
      screen.getByText(
        'Кошницата не можа да се синхронизира. Показваме последното запазено състояние.',
      ),
    ).toBeInTheDocument()
  })

  it('clears itself on dismiss', async () => {
    const user = userEvent.setup()
    useCart.setState({ lastWriteError: { code: 'CART_FULL' } })

    render(<CartWriteErrorBanner />)

    await user.click(screen.getByRole('button', { name: 'Затвори' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(useCart.getState().lastWriteError).toBeNull()
  })
})
