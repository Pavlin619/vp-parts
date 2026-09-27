import { render, screen } from '@testing-library/react'
import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import { officeHoursTable } from '@/lib/checkout/delivery/office-hours'
import { OfficeHoursTable } from './office-hours-table'

function office(overrides: Partial<DeliveryOfficeDto>): DeliveryOfficeDto {
  return {
    carrier: ShippingMethod.ECONT,
    code: '1',
    name: 'Офис',
    city: 'София',
    postCode: null,
    address: 'ул. Първа 1',
    latitude: 42.7,
    longitude: 23.3,
    type: DeliveryOfficeType.OFFICE,
    weekdayHours: { opensAt: '09:00', closesAt: '19:00' },
    saturdayHours: null,
    ...overrides,
  }
}

describe('OfficeHoursTable', () => {
  it('lists the hours by day and marks closed days', () => {
    render(<OfficeHoursTable rows={officeHoursTable(office({}))} />)

    expect(screen.getByText('Пн–Пт')).toBeInTheDocument()
    expect(screen.getByText('09:00–19:00')).toBeInTheDocument()
    expect(screen.getAllByText('затворено')).toHaveLength(2)
  })
})
