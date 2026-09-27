import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import { OfficeListItem } from './office-list-item'

type OfficeListItemProps = Parameters<typeof OfficeListItem>[0]

function office(overrides: Partial<DeliveryOfficeDto> = {}): DeliveryOfficeDto {
  return {
    carrier: ShippingMethod.ECONT,
    code: '1127',
    name: 'София Младост',
    placeId: '41',
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

function renderItem(overrides: Partial<OfficeListItemProps> = {}) {
  const props: OfficeListItemProps = {
    office: office(),
    availability: { isSelectable: true },
    isHovered: false,
    distanceMeters: null,
    onOpen: jest.fn(),
    onHover: jest.fn(),
    ...overrides,
  }

  render(<OfficeListItem {...props} />)
  return props
}

const officeButton = () => screen.getByRole('button', { name: /София Младост/ })

describe('OfficeListItem', () => {
  it('names the office with its address and its pin', () => {
    renderItem()

    expect(officeButton()).toBeEnabled()
    expect(screen.getByText('София бул. Александър Малинов №51')).toBeInTheDocument()
    expect(officeButton().querySelector('svg')).toHaveAttribute('data-office-type', 'OFFICE')
  })

  it('marks a locker as one, in words and with the locker pin', () => {
    renderItem({ office: office({ type: DeliveryOfficeType.LOCKER }) })

    expect(screen.getByText('Автомат')).toBeInTheDocument()
    expect(officeButton().querySelector('svg')).toHaveAttribute('data-office-type', 'LOCKER')
  })

  it('reports the office the customer opens', async () => {
    const user = userEvent.setup()
    const { onOpen } = renderItem()

    await user.click(officeButton())

    expect(onOpen).toHaveBeenCalledWith('1127')
  })

  it('reports the office the pointer is over', async () => {
    const user = userEvent.setup()
    const { onHover } = renderItem()

    await user.hover(officeButton())
    expect(onHover).toHaveBeenLastCalledWith('1127')

    await user.unhover(officeButton())
    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it.each([
    ['PARCEL_CHECKING', 'Проверяваме дали пратката се побира в автомат…'],
    ['PARCEL_CHECK_FAILED', 'Не успяхме да проверим дали пратката се побира в автомат.'],
    ['PARCEL_NOT_LOCKER_ELIGIBLE', 'Пратката не може да бъде доставена до автомат.'],
  ] as const)('disables a locker it cannot take and says why (%s)', (reason, copy) => {
    renderItem({
      office: office({ type: DeliveryOfficeType.LOCKER }),
      availability: { isSelectable: false, reason },
    })

    expect(officeButton()).toBeDisabled()
    expect(screen.getByText(copy)).toBeInTheDocument()
  })

  it('says how far the office is', () => {
    renderItem({ distanceMeters: 1_234 })

    expect(officeButton()).toHaveTextContent('1,2 км')
  })

  it('says no distance without a point to measure from', () => {
    renderItem()

    expect(officeButton()).not.toHaveTextContent(/км|\bм\b/)
  })
})
