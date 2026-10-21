import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppErrorCode, ORDER_KEY_HEADER, OrderStatus } from '@vp-parts-shop/shared'
import { ApiError } from '@/lib/api'
import { OrderConfirmation } from './order-confirmation'
import { orderDetail } from './order-fixtures'

jest.mock('@/lib/api/index', () => ({
  ...jest.requireActual('@/lib/api/index'),
  apiFetch: (path: string, options?: unknown) => mockApiFetch(path, options),
}))

const mockApiFetch = jest.fn()

function renderConfirmation() {
  // The order read retries an outage itself; a zero delay keeps that out of the clock.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <OrderConfirmation orderReference="VP-ORD-000123" />
    </QueryClientProvider>,
  )
}

describe('OrderConfirmation', () => {
  beforeEach(() => {
    mockApiFetch.mockReset().mockResolvedValue(orderDetail())
  })

  afterEach(() => {
    window.location.hash = ''
  })

  it('stands in a skeleton while the order is read', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}))

    renderConfirmation()

    expect(screen.getByTestId('order-confirmation-skeleton')).toBeInTheDocument()
  })

  it('reads the order it was opened for', async () => {
    renderConfirmation()

    await screen.findByText('VP-ORD-000123')
    expect(mockApiFetch).toHaveBeenCalledWith('/orders/VP-ORD-000123', { withSession: true })
  })

  it('offers a customer no account, having one', async () => {
    renderConfirmation()

    await screen.findByText('VP-ORD-000123')
    expect(screen.queryByRole('link', { name: 'Създайте профил' })).not.toBeInTheDocument()
  })

  it('names the order by its reference', async () => {
    renderConfirmation()

    expect(
      await screen.findByRole('heading', { name: 'Благодарим, Иван! Поръчката е приета.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('VP-ORD-000123')).toBeInTheDocument()
  })

  it('marks confirmation as the checkout step reached', async () => {
    renderConfirmation()

    await screen.findByText('VP-ORD-000123')
    expect(screen.getByText('Потвърждение')).toHaveAttribute('aria-current', 'step')
  })

  it('lists what was ordered at the prices it was placed at', async () => {
    renderConfirmation()

    const items = await screen.findByRole('list', { name: 'Поръчани артикули' })
    expect(within(items).getByText('WL6340')).toBeInTheDocument()
    expect(within(items).getByText('25,98 €')).toBeInTheDocument()
    expect(within(items).getByText('2 × 12,99 €')).toBeInTheDocument()
    expect(within(items).getByText('BP1234')).toBeInTheDocument()
  })

  it('shows the delivery and the amount to pay on receipt', async () => {
    renderConfirmation()

    expect(await screen.findByText('Еконт София Център')).toBeInTheDocument()
    expect(screen.getByText('Платете 53,04 € при получаване')).toBeInTheDocument()
  })

  it('says an order it cannot find is not found', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(404, AppErrorCode.ORDER_NOT_FOUND))

    renderConfirmation()

    expect(await screen.findByText('Поръчката не е намерена')).toBeInTheDocument()
  })

  it('asks a signed-out visitor to sign in', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(401, AppErrorCode.UNAUTHORIZED))

    renderConfirmation()

    expect(await screen.findByRole('link', { name: 'Вход' })).toHaveAttribute('href', '/sign-in')
  })

  it('offers a retry when the read failed', async () => {
    const user = userEvent.setup()
    const outage = new ApiError(503, AppErrorCode.INTERNAL_ERROR)
    mockApiFetch
      .mockRejectedValueOnce(outage)
      .mockRejectedValueOnce(outage)
      .mockRejectedValueOnce(outage)

    renderConfirmation()
    await user.click(await screen.findByRole('button', { name: 'Опитай отново' }))

    expect(await screen.findByText('VP-ORD-000123')).toBeInTheDocument()
  })

  describe('a guest’s order, opened from its link', () => {
    const GUEST_ORDER = {
      ...orderDetail(),
      status: OrderStatus.AWAITING_CONFIRMATION,
      contact: {
        firstName: 'Мария',
        lastName: 'Иванова',
        phoneNumber: '+359888765432',
        email: null,
      },
    }

    beforeEach(() => {
      window.location.hash = '#k=key-1'
      mockApiFetch.mockResolvedValue(GUEST_ORDER)
    })

    it('reads the order with the key the link carries, and no session', async () => {
      renderConfirmation()

      await screen.findByText('VP-ORD-000123')
      expect(mockApiFetch).toHaveBeenCalledWith('/orders/guest/VP-ORD-000123', {
        headers: { [ORDER_KEY_HEADER]: 'key-1' },
      })
    })

    it('says the office will call the phone given to confirm it', async () => {
      renderConfirmation()

      expect(await screen.findByText(/Ще ви се обадим на/)).toHaveTextContent(
        'Ще ви се обадим на +359888765432, за да потвърдим поръчката.',
      )
    })

    it('offers an account for the next order', async () => {
      renderConfirmation()

      expect(await screen.findByRole('link', { name: 'Създайте профил' })).toHaveAttribute(
        'href',
        '/sign-up',
      )
    })
  })
})
