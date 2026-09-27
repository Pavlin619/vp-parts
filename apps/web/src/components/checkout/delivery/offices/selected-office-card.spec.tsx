import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import { SelectedOfficeCard } from './selected-office-card'

const OFFICE: DeliveryOfficeDto = {
  carrier: ShippingMethod.ECONT,
  code: '1127',
  name: 'София Младост',
  city: 'София',
  postCode: null,
  address: 'София бул. Александър Малинов №51',
  latitude: 42.65,
  longitude: 23.37,
  type: DeliveryOfficeType.OFFICE,
  weekdayHours: { opensAt: '09:00', closesAt: '18:00' },
  saturdayHours: { opensAt: '09:00', closesAt: '13:00' },
}

function renderCard(onChange = jest.fn(), office = OFFICE) {
  render(<SelectedOfficeCard office={office} carrierName="Еконт" onChange={onChange} />)
}

describe('SelectedOfficeCard', () => {
  it('shows where the parcel will wait and its hours', () => {
    renderCard()

    expect(screen.getByText('София Младост')).toBeInTheDocument()
    expect(screen.getByText('София бул. Александър Малинов №51')).toBeInTheDocument()
    expect(screen.getByText('Пн–Пт 09:00–18:00 · Сб 09:00–13:00')).toBeInTheDocument()
  })

  it('marks a chosen locker as one', () => {
    renderCard(jest.fn(), { ...OFFICE, type: DeliveryOfficeType.LOCKER })

    expect(screen.getByText('Автомат')).toBeInTheDocument()
  })

  it('does not mark a staffed office as a locker', () => {
    renderCard()

    expect(screen.queryByText('Автомат')).not.toBeInTheDocument()
  })

  it('says the carrier will send word when the parcel arrives', () => {
    renderCard()

    expect(
      screen.getByText('Еконт ще ви изпрати SMS, когато пратката пристигне.'),
    ).toBeInTheDocument()
  })

  it('lets the customer pick another office', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    renderCard(onChange)

    await user.click(screen.getByRole('button', { name: 'Промени' }))

    expect(onChange).toHaveBeenCalled()
  })
})
