import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentMethod } from '@vp-parts-shop/shared'
import { PaymentMethodPanel } from './payment-method-panel'

function renderPanel(method: PaymentMethod | null, onMethodChange = jest.fn()) {
  render(<PaymentMethodPanel method={method} onMethodChange={onMethodChange} />)

  return onMethodChange
}

describe('PaymentMethodPanel', () => {
  it('offers card and cash on delivery as one radio group, none preselected', () => {
    renderPanel(null)

    const group = screen.getByRole('radiogroup', { name: 'Метод на плащане' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Плащане с карта/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Наложен платеж/ })).not.toBeChecked()
  })

  it('checks the chosen method', () => {
    renderPanel(PaymentMethod.CASH_ON_DELIVERY)

    expect(screen.getByRole('radio', { name: /Наложен платеж/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Плащане с карта/ })).not.toBeChecked()
  })

  // Card waits on its contract; nothing may promise it before then.
  it('shows card as coming soon, without a fee, and does not let it be picked', async () => {
    const user = userEvent.setup()
    const onMethodChange = renderPanel(null)

    const card = screen.getByRole('radio', { name: /Плащане с карта/ })
    expect(card).toBeDisabled()
    expect(screen.getByText('Очаквайте скоро')).toBeInTheDocument()
    expect(screen.queryByText(/такса/)).not.toBeInTheDocument()

    await user.click(screen.getByText('Плащане с карта'))

    expect(onMethodChange).not.toHaveBeenCalled()
  })

  it('does not show a card choice remembered from before as chosen', () => {
    renderPanel(PaymentMethod.CARD)

    expect(screen.getByRole('radio', { name: /Плащане с карта/ })).not.toBeChecked()
  })

  it('reports the method picked', async () => {
    const user = userEvent.setup()
    const onMethodChange = renderPanel(null)

    await user.click(screen.getByRole('radio', { name: /Наложен платеж/ }))

    expect(onMethodChange).toHaveBeenCalledWith(PaymentMethod.CASH_ON_DELIVERY)
  })
})
