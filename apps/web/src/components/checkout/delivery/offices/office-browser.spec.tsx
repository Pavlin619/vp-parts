import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import type { ParcelCheck } from '@/lib/checkout/delivery/office-availability'
import type { ReferencePoint } from '@/lib/checkout/delivery/office-distance'
import { OfficeBrowser } from './office-browser'

interface MapMockProps {
  offices: DeliveryOfficeDto[]
  selectedCode: string | null
  hoveredCode: string | null
  referencePoint: ReferencePoint | null
  onSelect: (code: string) => void
  onHover: (code: string | null) => void
}

jest.mock('./map', () => ({
  OfficeMap: ({
    offices,
    selectedCode,
    hoveredCode,
    referencePoint,
    onSelect,
    onHover,
  }: MapMockProps) => (
    <div
      data-testid="office-map"
      data-selected={selectedCode ?? ''}
      data-hovered={hoveredCode ?? ''}
      data-reference={referencePoint?.kind ?? ''}
    >
      {offices.map((office) => (
        <button
          key={office.code}
          type="button"
          onClick={() => onSelect(office.code)}
          onMouseEnter={() => onHover(office.code)}
        >
          маркер {office.code}
        </button>
      ))}
    </div>
  ),
}))

function office(overrides: Partial<DeliveryOfficeDto>): DeliveryOfficeDto {
  return {
    carrier: ShippingMethod.ECONT,
    code: '1000',
    name: 'Офис',
    placeId: '41',
    city: 'София',
    postCode: null,
    address: 'София ул. Първа 1',
    latitude: 42.7,
    longitude: 23.3,
    type: DeliveryOfficeType.OFFICE,
    weekdayHours: null,
    saturdayHours: null,
    ...overrides,
  }
}

const MLADOST = office({ code: '1', name: 'София Младост', address: 'София бул. Малинов 51' })
const PLOVDIV = office({
  code: '2',
  name: 'Пловдив Център',
  city: 'Пловдив',
  address: 'Пловдив ул. Вазов 12',
  latitude: 42.14,
  longitude: 24.75,
})
const LOCKER = office({
  code: '3',
  name: 'Еконтомат Люлин',
  type: DeliveryOfficeType.LOCKER,
  latitude: 42.71,
  longitude: 23.26,
})
const OFFICES = [MLADOST, PLOVDIV, LOCKER]

const FITS_LOCKER: ParcelCheck = {
  state: 'ready',
  parcel: { weightGrams: 1200, unmeasuredArticles: [], isLockerEligible: true },
}

function renderBrowser(overrides: Partial<Parameters<typeof OfficeBrowser>[0]> = {}) {
  const props = {
    offices: OFFICES,
    parcelCheck: FITS_LOCKER,
    carrier: ShippingMethod.ECONT,
    chosenCode: null,
    onChoose: jest.fn(),
    ...overrides,
  }

  render(<OfficeBrowser {...props} />)
  return props
}

const list = () => within(screen.getByRole('list', { name: 'Офиси' }))
const map = () => screen.getByTestId('office-map')
const searchBox = () => screen.getByRole('searchbox', { name: 'Търсене на офис' })
const openOffice = () => screen.getByRole('heading', { level: 3 })
const listedNames = () =>
  list()
    .getAllByRole('button')
    .map((button) => button.querySelector('span > span')?.textContent)

const getCurrentPosition = jest.fn()

function locateDeviceAt(latitude: number, longitude: number) {
  getCurrentPosition.mockImplementation((succeed) => succeed({ coords: { latitude, longitude } }))
}

beforeEach(() => {
  getCurrentPosition.mockReset()
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  })
})

describe('OfficeBrowser', () => {
  it('counts the offices and shows each in the list and on the map', () => {
    renderBrowser()

    expect(screen.getByText('3 резултата')).toBeInTheDocument()
    expect(list().getByRole('button', { name: /Пловдив Център/ })).toBeInTheDocument()
    expect(within(map()).getByRole('button', { name: 'маркер 2' })).toBeInTheDocument()
  })

  it('narrows the list and the map to the search', async () => {
    const user = userEvent.setup()
    renderBrowser()

    await user.type(searchBox(), 'пловдив')

    expect(list().getAllByRole('button')).toHaveLength(1)
    expect(list().getByRole('button', { name: /Пловдив Център/ })).toBeInTheDocument()
    expect(within(map()).getAllByRole('button')).toHaveLength(1)
  })

  it('narrows to a city picked from the suggestions', async () => {
    const user = userEvent.setup()
    renderBrowser()

    await user.type(searchBox(), 'плов')
    await user.click(screen.getByRole('button', { name: 'Пловдив' }))

    expect(searchBox()).toHaveValue('')
    expect(screen.getByText('Пловдив', { selector: 'b' })).toBeInTheDocument()
    expect(list().getAllByRole('button')).toHaveLength(1)
  })

  it('opens an office picked from the suggestions', async () => {
    const user = userEvent.setup()
    renderBrowser()

    await user.type(searchBox(), 'люлин')
    const suggestions = within(screen.getByLabelText('Предложения'))
    await user.click(suggestions.getByRole('button', { name: /Еконтомат Люлин/ }))

    expect(openOffice()).toHaveTextContent('Еконтомат Люлин')
  })

  it('opens the office whose pin is clicked in place of the list', async () => {
    const user = userEvent.setup()
    renderBrowser()

    await user.click(within(map()).getByRole('button', { name: 'маркер 2' }))

    expect(openOffice()).toHaveTextContent('Пловдив Център')
    expect(screen.queryByRole('list', { name: 'Офиси' })).not.toBeInTheDocument()
  })

  it('opens an office from the list and marks its pin, and goes back to the list', async () => {
    const user = userEvent.setup()
    renderBrowser()

    await user.click(list().getByRole('button', { name: /София Младост/ }))
    expect(openOffice()).toHaveTextContent('София Младост')
    expect(map()).toHaveAttribute('data-selected', '1')

    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(list().getAllByRole('button')).toHaveLength(3)
    expect(map()).toHaveAttribute('data-selected', '')
  })

  it('goes back to the list when the search changes', async () => {
    const user = userEvent.setup()
    renderBrowser()
    await user.click(list().getByRole('button', { name: /София Младост/ }))

    await user.type(searchBox(), 'пловдив')

    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
    expect(list().getByRole('button', { name: /Пловдив Център/ })).toBeInTheDocument()
  })

  it('shares the hovered office between the list and the map', async () => {
    const user = userEvent.setup()
    renderBrowser()

    await user.hover(list().getByRole('button', { name: /София Младост/ }))

    expect(map()).toHaveAttribute('data-hovered', '1')
  })

  it('reports the office confirmed in the list', async () => {
    const user = userEvent.setup()
    const { onChoose } = renderBrowser()

    await user.click(list().getByRole('button', { name: /Пловдив Център/ }))
    await user.click(screen.getByRole('button', { name: 'Вземи от този офис' }))

    expect(onChoose).toHaveBeenCalledWith('2')
  })

  it('lists the offices in the order the carrier gives them until asked to sort', () => {
    renderBrowser()

    expect(listedNames().slice(0, 2)).toEqual(['София Младост', 'Пловдив Център'])
    expect(map()).toHaveAttribute('data-reference', '')
  })

  it('starts with every office, nearest to the already chosen one first', () => {
    renderBrowser({ chosenCode: '2' })

    expect(listedNames()[0]).toBe('Пловдив Център')
    expect(list().getAllByRole('button')).toHaveLength(3)
    expect(screen.getByText('Близо до Пловдив Център')).toBeInTheDocument()
    expect(map()).toHaveAttribute('data-reference', 'chosen-office')
  })

  it('sorts by closeness to the customer once located, and says how far each office is', async () => {
    const user = userEvent.setup()
    locateDeviceAt(42.15, 24.74)
    renderBrowser()

    await user.click(screen.getByRole('button', { name: 'Близо до мен' }))

    expect(listedNames()[0]).toBe('Пловдив Център')
    expect(list().getByRole('button', { name: /Пловдив Център/ })).toHaveTextContent('1,4 км')
    expect(screen.getByText('Близо до вас')).toBeInTheDocument()
    expect(map()).toHaveAttribute('data-reference', 'device')
  })

  it('looks near the customer in every city, dropping a city picked before', async () => {
    const user = userEvent.setup()
    locateDeviceAt(42.15, 24.74)
    renderBrowser()
    await user.type(searchBox(), 'плов')
    await user.click(screen.getByRole('button', { name: 'Пловдив' }))

    await user.click(screen.getByRole('button', { name: 'Близо до мен' }))

    expect(screen.queryByText('Пловдив', { selector: 'b' })).not.toBeInTheDocument()
    expect(list().getAllByRole('button')).toHaveLength(3)
  })

  it("goes back to the carrier's order when the customer drops the sorting", async () => {
    const user = userEvent.setup()
    renderBrowser({ chosenCode: '2' })

    await user.click(
      screen.getByRole('button', { name: 'Спри подреждането по близост до Пловдив Център' }),
    )

    expect(listedNames()[0]).toBe('София Младост')
    expect(map()).toHaveAttribute('data-reference', '')
  })

  // A searched place frames the map on itself; the customer's point would pull it out to the country.
  it('frames the map around the point only while no place is searched', async () => {
    const user = userEvent.setup()
    locateDeviceAt(42.69, 23.32)
    renderBrowser()
    await user.click(screen.getByRole('button', { name: 'Близо до мен' }))

    await user.type(searchBox(), 'пловдив')

    expect(map()).toHaveAttribute('data-reference', '')
    expect(screen.getByText('Близо до вас')).toBeInTheDocument()
  })

  it('says why the customer could not be located and keeps the list as it was', async () => {
    const user = userEvent.setup()
    getCurrentPosition.mockImplementation((_, fail) => fail({ code: 1, PERMISSION_DENIED: 1 }))
    renderBrowser()

    await user.click(screen.getByRole('button', { name: 'Близо до мен' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Нямаме достъп до местоположението ви.')
    expect(listedNames()[0]).toBe('София Младост')
  })

  it('offers to cancel only when an office is already chosen', async () => {
    const user = userEvent.setup()
    const onCancel = jest.fn()
    renderBrowser({ onCancel })

    await user.click(screen.getByRole('button', { name: 'Отказ' }))

    expect(onCancel).toHaveBeenCalled()
  })

  it('has no cancel without a chosen office', () => {
    renderBrowser()

    expect(screen.queryByRole('button', { name: 'Отказ' })).not.toBeInTheDocument()
  })

  // A marker is a way to choose; a locker the parcel cannot go to is not a choice.
  it('keeps lockers the parcel does not fit off the map', () => {
    renderBrowser({
      parcelCheck: {
        state: 'ready',
        parcel: { weightGrams: 90_000, unmeasuredArticles: [], isLockerEligible: false },
      },
    })

    expect(list().getByRole('button', { name: /Еконтомат Люлин/ })).toBeDisabled()
    expect(within(map()).queryByRole('button', { name: 'маркер 3' })).not.toBeInTheDocument()
    expect(within(map()).getByRole('button', { name: 'маркер 1' })).toBeInTheDocument()
  })

  it('credits the carrier for the office data', () => {
    renderBrowser()

    expect(screen.getByText('Данните за офисите се предоставят от Еконт')).toBeInTheDocument()
  })
})
