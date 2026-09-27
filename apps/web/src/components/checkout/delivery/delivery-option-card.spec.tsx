import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Truck } from 'lucide-react'
import { DeliveryOptionCard } from './delivery-option-card'

function renderCard(isSelected: boolean, onSelect = jest.fn()) {
  render(
    <DeliveryOptionCard
      name="delivery-method"
      value="courier-address"
      label="Доставка с куриер до адрес"
      description="До посочен от вас адрес"
      icon={<Truck />}
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

  it('selects itself when clicked', async () => {
    const user = userEvent.setup()
    const onSelect = renderCard(false)

    await user.click(screen.getByText('Доставка с куриер до адрес'))

    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
