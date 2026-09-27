import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import { OfficeList } from './office-list'

type OfficeListProps = Parameters<typeof OfficeList>[0]

function office(overrides: Partial<DeliveryOfficeDto> = {}): DeliveryOfficeDto {
  return {
    carrier: ShippingMethod.ECONT,
    code: '1127',
    name: 'София Младост',
    city: 'София',
    postCode: null,
    address: 'София бул. Александър Малинов №51',
    latitude: 42.65,
    longitude: 23.37,
    type: DeliveryOfficeType.OFFICE,
    weekdayHours: null,
    saturdayHours: null,
    ...overrides,
  }
}

const manyOffices = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    office({ code: String(index), name: `Офис ${index}` }),
  )

function renderList(overrides: Partial<OfficeListProps> = {}) {
  const props: OfficeListProps = {
    offices: manyOffices(3),
    parcelCheck: { state: 'checking' },
    hoveredCode: null,
    onOpen: jest.fn(),
    onHover: jest.fn(),
    ...overrides,
  }

  render(<OfficeList {...props} />)
  return props
}

const officeButtons = () => screen.getAllByRole('button', { name: /Офис/ })

describe('OfficeList', () => {
  it('lists the offices in order', () => {
    renderList()

    expect(screen.getByRole('list', { name: 'Офиси' })).toBeInTheDocument()
    expect(officeButtons().map((button) => button.textContent)).toEqual([
      expect.stringContaining('Офис 0'),
      expect.stringContaining('Офис 1'),
      expect.stringContaining('Офис 2'),
    ])
  })

  it('reports the office the customer opens', async () => {
    const user = userEvent.setup()
    const { onOpen } = renderList()

    await user.click(screen.getByRole('button', { name: /Офис 1/ }))

    expect(onOpen).toHaveBeenCalledWith('1')
  })

  it('disables a locker the parcel does not fit', () => {
    renderList({
      offices: [office({ name: 'Офис автомат', type: DeliveryOfficeType.LOCKER })],
      parcelCheck: {
        state: 'ready',
        parcel: { weightGrams: 90_000, unmeasuredArticles: [], isLockerEligible: false },
      },
    })

    expect(screen.getByRole('button', { name: /Офис автомат/ })).toBeDisabled()
  })

  it('lists the first fifty and says how many more there are', () => {
    renderList({ offices: manyOffices(120) })

    expect(officeButtons()).toHaveLength(50)
    expect(
      screen.getByText('Показани са 50 от 120. Уточнете търсенето, за да видите останалите.'),
    ).toBeInTheDocument()
  })

  it('says so when nothing matches', () => {
    renderList({ offices: [] })

    expect(screen.getByText('Няма офиси, които отговарят на търсенето.')).toBeInTheDocument()
  })
})
