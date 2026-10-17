import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Truck } from 'lucide-react'
import type { ReactNode } from 'react'
import { DeliveryOptionCard } from './delivery-option-card'

function renderCard(isSelected: boolean, onSelect = jest.fn(), trailing?: ReactNode) {
  render(
    <DeliveryOptionCard
      name="delivery-method"
      value="courier-address"
      label="Доставка с куриер до адрес"
      description="До посочен от вас адрес"
      icon={<Truck />}
      trailing={trailing}
      isSelected={isSelected}
      onSelect={onSelect}
    />,
  )

  return onSelect
}

describe('DeliveryOptionCard', () => {
  it('is a radio named by its label', () => {
    renderCard(true)

    expect(
      screen.getByRole('radio', { name: /Доставка с куриер до адрес/ }),
    ).toBeChecked()
    expect(screen.getByText('До посочен от вас адрес')).toBeInTheDocument()
  })

  it('shows what it carries at its far end', () => {
    renderCard(false, jest.fn(), <span>4,90 €</span>)

    expect(screen.getByRole('radio', { name: /4,90 €/ })).toBeInTheDocument()
  })

  it('selects itself when clicked', async () => {
    const user = userEvent.setup()
    const onSelect = renderCard(false)

    await user.click(screen.getByText('Доставка с куриер до адрес'))

    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('can be shown without being choosable', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    render(
      <DeliveryOptionCard
        name="payment-method"
        value="CARD"
        label="Плащане с карта"
        description="Visa, Mastercard"
        icon={<Truck />}
        isSelected={false}
        isDisabled
        onSelect={onSelect}
      />,
    )

    await user.click(screen.getByText('Плащане с карта'))

    expect(screen.getByRole('radio', { name: /Плащане с карта/ })).toBeDisabled()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
