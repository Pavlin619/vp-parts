import { formatOfficeHours, officeHoursTable } from './office-hours'

describe('formatOfficeHours', () => {
  it('names weekday and Saturday hours', () => {
    expect(
      formatOfficeHours({
        weekdayHours: { opensAt: '09:00', closesAt: '18:00' },
        saturdayHours: { opensAt: '09:00', closesAt: '13:00' },
      }),
    ).toBe('Пн–Пт 09:00–18:00 · Сб 09:00–13:00')
  })

  it('says an office is closed on Saturday when it has no Saturday hours', () => {
    expect(
      formatOfficeHours({
        weekdayHours: { opensAt: '08:30', closesAt: '17:30' },
        saturdayHours: null,
      }),
    ).toBe('Пн–Пт 08:30–17:30 · Сб почивен ден')
  })

  // Lockers read 00:00–23:59 every day, which is a clumsy way of saying "always".
  it('calls round-the-clock hours non-stop', () => {
    const allDay = { opensAt: '00:00', closesAt: '23:59' }

    expect(
      formatOfficeHours({ weekdayHours: allDay, saturdayHours: allDay }),
    ).toBe('Денонощно')
  })

  it('says nothing when the carrier gives no hours', () => {
    expect(
      formatOfficeHours({ weekdayHours: null, saturdayHours: null }),
    ).toBeNull()
  })
})

const OFFICE_HOURS = {
  weekdayHours: { opensAt: '09:00', closesAt: '19:00' },
  saturdayHours: { opensAt: '10:00', closesAt: '14:00' },
}

describe('officeHoursTable', () => {
  it('lists weekdays, Saturday and Sunday', () => {
    expect(officeHoursTable({ ...OFFICE_HOURS, saturdayHours: null })).toEqual([
      { days: 'Пн–Пт', hours: '09:00–19:00' },
      { days: 'Сб', hours: null },
      { days: 'Нд', hours: null },
    ])
  })

  it('folds round-the-clock hours into one line', () => {
    const allDay = { opensAt: '00:00', closesAt: '23:59' }

    expect(officeHoursTable({ weekdayHours: allDay, saturdayHours: allDay })).toEqual([
      { days: 'Всеки ден', hours: '00:00–24:00' },
    ])
  })

  it('is empty when the carrier gives no hours', () => {
    expect(officeHoursTable({ weekdayHours: null, saturdayHours: null })).toEqual([])
  })
})
