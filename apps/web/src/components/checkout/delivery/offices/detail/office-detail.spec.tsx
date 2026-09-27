import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import { OfficeDetail } from './office-detail'

type OfficeDetailProps = Parameters<typeof OfficeDetail>[0]

function office(overrides: Partial<DeliveryOfficeDto> = {}): DeliveryOfficeDto {
  return {
    carrier: ShippingMethod.ECONT,
    code: '1127',
    name: 'София Младост',
    city: 'София',
    postCode: '1784',
    address: 'София бул. Александър Малинов №51',
    latitude: 42.65,
    longitude: 23.37,
    type: DeliveryOfficeType.OFFICE,
    weekdayHours: { opensAt: '09:00', closesAt: '18:00' },
    saturdayHours: null,
    ...overrides,
  }
}

function renderDetail(overrides: Partial<OfficeDetailProps> = {}) {
  const props: OfficeDetailProps = {
    office: office(),
    availability: { isSelectable: true },
    onBack: jest.fn(),
    onChoose: jest.fn(),
    ...overrides,
  }

  render(<OfficeDetail {...props} />)
  return props
}

describe('OfficeDetail', () => {
  it('shows the office name, address and working hours', () => {
    renderDetail()

    expect(screen.getByRole('heading', { name: 'София Младост' })).toBeInTheDocument()
    expect(screen.getByText('София бул. Александър Малинов №51')).toBeInTheDocument()
    expect(screen.getByText('Пн–Пт')).toBeInTheDocument()
    expect(screen.getByText('09:00–18:00')).toBeInTheDocument()
  })

  it('leaves out the working hours when the carrier gives none', () => {
    renderDetail({ office: office({ weekdayHours: null }) })

    expect(screen.queryByRole('heading', { name: 'Работно време' })).not.toBeInTheDocument()
  })

  it('opens the office in Google Maps in a new tab', () => {
    renderDetail()

    const link = screen.getByRole('link', { name: 'Отвори в Google Maps' })
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=42.65,23.37',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('marks a locker as one', () => {
    renderDetail({ office: office({ type: DeliveryOfficeType.LOCKER }) })

    expect(screen.getByText('Автомат')).toBeInTheDocument()
  })

  it('reports the office the customer chooses', async () => {
    const user = userEvent.setup()
    const { onChoose } = renderDetail()

    await user.click(screen.getByRole('button', { name: 'Вземи от този офис' }))

    expect(onChoose).toHaveBeenCalledWith('1127')
  })

  it('goes back to the list', async () => {
    const user = userEvent.setup()
    const { onBack } = renderDetail()

    await user.click(screen.getByRole('button', { name: 'Назад' }))

    expect(onBack).toHaveBeenCalled()
  })

  // Opened from a row that is now hidden, or from a pin the keyboard cannot reach.
  it('takes keyboard focus when it opens', () => {
    renderDetail()

    expect(screen.getByRole('heading', { name: 'София Младост' })).toHaveFocus()
  })

  it('offers no choice for a locker the parcel cannot go to, and says why', () => {
    renderDetail({
      office: office({ type: DeliveryOfficeType.LOCKER }),
      availability: { isSelectable: false, reason: 'PARCEL_NOT_LOCKER_ELIGIBLE' },
    })

    expect(screen.queryByRole('button', { name: 'Вземи от този офис' })).not.toBeInTheDocument()
    expect(
      screen.getByText('Пратката не може да бъде доставена до автомат.'),
    ).toBeInTheDocument()
  })
})
