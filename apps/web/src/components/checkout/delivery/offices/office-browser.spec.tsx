import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
  type DeliveryPlaceDto,
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
    latitude: 42.65,
    longitude: 23.37,
    type: DeliveryOfficeType.OFFICE,
    weekdayHours: null,
    saturdayHours: null,
    ...overrides,
  }
}

function place(overrides: Partial<DeliveryPlaceDto>): DeliveryPlaceDto {
  return {
    carrier: ShippingMethod.ECONT,
    id: '41',
    name: 'София',
    region: 'София',
    postCode: '1000',
    servingOfficeCode: null,
    ...overrides,
  }
}

const MLADOST = office({ code: '1', name: 'София Младост', address: 'София бул. Малинов 51' })
const PLOVDIV = office({
  code: '2',
  name: 'Пловдив Център',
  placeId: '4000',
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
const PLEVEN_METRO = office({
  code: '5817',
  name: 'Плевен Метро',
  placeId: '1500',
  city: 'Плевен',
  address: 'Плевен ул. Дойран 1',
  latitude: 43.4,
  longitude: 24.6,
})
const OFFICES = [MLADOST, PLOVDIV, LOCKER, PLEVEN_METRO]

const PLACES = [
  place({}),
  place({ id: '4000', name: 'Пловдив', region: 'Пловдив', postCode: '4000' }),
  place({ id: '1500', name: 'Плевен', region: 'Плевен', postCode: '5800' }),
  place({
    id: '27183',
    name: 'Ясен',
    region: 'Плевен',
    postCode: '5850',
    servingOfficeCode: '5817',
  }),
]

const FITS_LOCKER: ParcelCheck = {
  state: 'ready',
  parcel: { weightGrams: 1200, unmeasuredArticles: [], isLockerEligible: true },
}

function renderBrowser(overrides: Partial<Parameters<typeof OfficeBrowser>[0]> = {}) {
  const props = {
    offices: OFFICES,
    places: PLACES,
    parcelCheck: FITS_LOCKER,
    carrier: ShippingMethod.ECONT,
    chosenCode: null,
    approximateLocation: null,
    onChoose: jest.fn(),
    ...overrides,
  }

  render(<OfficeBrowser {...props} />)
  return props
}

const list = () => within(screen.getByRole('list', { name: 'Офиси' }))
const map = () => screen.getByTestId('office-map')
const searchBox = () => screen.getByRole('searchbox', { name: 'Търсене на офис' })
const settlementBox = () => screen.getByRole('searchbox', { name: 'Населено място' })
const regionSelect = () => screen.getByRole('combobox', { name: 'Област' })
const openOffice = () => screen.getByRole('heading', { level: 3 })
const prompt = () => screen.queryByText('Изберете населено място или натиснете „Близо до мен“.')
const listedNames = () =>
  list()
    .getAllByRole('button')
    .map((button) => button.querySelector('span > span')?.textContent)

type User = ReturnType<typeof userEvent.setup>

async function pickPlace(user: User, query: string, name: RegExp) {
  await user.type(settlementBox(), query)
  await user.click(within(screen.getByLabelText('Населени места')).getByRole('button', { name }))
}

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
  describe('before a place is chosen', () => {
    it('asks for a place, while the map shows every office', () => {
      renderBrowser()

      expect(prompt()).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Офиси' })).not.toBeInTheDocument()
      expect(within(map()).getAllByRole('button')).toHaveLength(4)
    })

    it('searches every office by name', async () => {
      const user = userEvent.setup()
      renderBrowser()

      await user.type(searchBox(), 'пловдив')

      expect(listedNames()).toEqual(['Пловдив Център'])
      expect(within(map()).getAllByRole('button')).toHaveLength(1)
    })

    it('opens the office whose pin is clicked', async () => {
      const user = userEvent.setup()
      renderBrowser()

      await user.click(within(map()).getByRole('button', { name: 'маркер 2' }))

      expect(openOffice()).toHaveTextContent('Пловдив Център')
    })
  })

  describe('with a place chosen', () => {
    it("lists the place's offices, says where, and frames the map on it", async () => {
      const user = userEvent.setup()
      renderBrowser()

      await pickPlace(user, 'плов', /Пловдив/)

      expect(listedNames()).toEqual(['Пловдив Център'])
      expect(screen.getByText('Пловдив', { selector: 'b' })).toBeInTheDocument()
      expect(map()).toHaveAttribute('data-reference', 'place')
      expect(screen.queryByRole('button', { name: /Спри подреждането/ })).not.toBeInTheDocument()
    })

    it('fills in the region of the place picked', async () => {
      const user = userEvent.setup()
      renderBrowser()

      await pickPlace(user, 'ясен', /Ясен/)

      expect(regionSelect()).toHaveValue('Плевен')
    })

    it('starts a village with the office that serves it', async () => {
      const user = userEvent.setup()
      renderBrowser()

      await pickPlace(user, 'ясен', /Ясен/)

      expect(listedNames()[0]).toBe('Плевен Метро')
      expect(list().getByRole('button', { name: /Плевен Метро/ })).toHaveTextContent('Обслужва Ясен')
    })

    it("narrows the place's offices to the search", async () => {
      const user = userEvent.setup()
      renderBrowser()
      await pickPlace(user, 'соф', /София/)
      expect(list().getAllByRole('button')).toHaveLength(2)

      await user.type(searchBox(), 'люлин')

      expect(listedNames()).toEqual(['Еконтомат ЛюлинАвтомат'])
    })

    it('asks for a place again once it is cleared', async () => {
      const user = userEvent.setup()
      renderBrowser()
      await pickPlace(user, 'плов', /Пловдив/)

      await user.click(screen.getByRole('button', { name: 'Изчисти населеното място' }))

      expect(prompt()).toBeInTheDocument()
    })

    it('drops the place when another region is chosen', async () => {
      const user = userEvent.setup()
      renderBrowser()
      await pickPlace(user, 'плов', /Пловдив/)

      await user.selectOptions(regionSelect(), 'Плевен')

      expect(settlementBox()).toHaveValue('')
      expect(prompt()).toBeInTheDocument()
    })
  })

  it('opens an office picked from the suggestions, in its place', async () => {
    const user = userEvent.setup()
    renderBrowser()

    await user.type(searchBox(), 'люлин')
    const suggestions = within(screen.getByLabelText('Предложения'))
    await user.click(suggestions.getByRole('button', { name: /Еконтомат Люлин/ }))

    expect(openOffice()).toHaveTextContent('Еконтомат Люлин')
    expect(settlementBox()).toHaveValue('София')
  })

  it('opens an office from the list and marks its pin, and goes back to the list', async () => {
    const user = userEvent.setup()
    renderBrowser()
    await pickPlace(user, 'соф', /София/)

    await user.click(list().getByRole('button', { name: /София Младост/ }))
    expect(openOffice()).toHaveTextContent('София Младост')
    expect(map()).toHaveAttribute('data-selected', '1')

    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(list().getAllByRole('button')).toHaveLength(2)
    expect(map()).toHaveAttribute('data-selected', '')
  })

  it('goes back to the list when the search changes', async () => {
    const user = userEvent.setup()
    renderBrowser()
    await pickPlace(user, 'соф', /София/)
    await user.click(list().getByRole('button', { name: /София Младост/ }))

    await user.type(searchBox(), 'люлин')

    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
    expect(listedNames()).toEqual(['Еконтомат ЛюлинАвтомат'])
  })

  it('shares the hovered office between the list and the map', async () => {
    const user = userEvent.setup()
    renderBrowser()
    await pickPlace(user, 'соф', /София/)

    await user.hover(list().getByRole('button', { name: /София Младост/ }))

    expect(map()).toHaveAttribute('data-hovered', '1')
  })

  it('reports the office confirmed in the list', async () => {
    const user = userEvent.setup()
    const { onChoose } = renderBrowser()
    await pickPlace(user, 'плов', /Пловдив/)

    await user.click(list().getByRole('button', { name: /Пловдив Център/ }))
    await user.click(screen.getByRole('button', { name: 'Вземи от този офис' }))

    expect(onChoose).toHaveBeenCalledWith('2')
  })

  describe('with a location guessed from the request', () => {
    const NEAR_PLOVDIV = { latitude: 42.15, longitude: 24.74 }
    const note = () => screen.queryByText(/по приблизителното ви местоположение/)

    it('starts in the guessed place and says it is a guess', () => {
      renderBrowser({ approximateLocation: NEAR_PLOVDIV })

      expect(settlementBox()).toHaveValue('Пловдив')
      expect(listedNames()).toEqual(['Пловдив Център'])
      expect(note()).toBeInTheDocument()
    })

    it('stops saying so once the customer picks a place', async () => {
      const user = userEvent.setup()
      renderBrowser({ approximateLocation: NEAR_PLOVDIV })

      await user.click(screen.getByRole('button', { name: 'Изчисти населеното място' }))
      await pickPlace(user, 'соф', /София/)

      expect(note()).not.toBeInTheDocument()
    })

    it('gives way to the office already chosen', () => {
      renderBrowser({ approximateLocation: NEAR_PLOVDIV, chosenCode: '1' })

      expect(settlementBox()).toHaveValue('София')
      expect(note()).not.toBeInTheDocument()
    })
  })

  describe('coming back to change the chosen office', () => {
    it("starts in its place, nearest to it", () => {
      renderBrowser({ chosenCode: '2' })

      expect(settlementBox()).toHaveValue('Пловдив')
      expect(regionSelect()).toHaveValue('Пловдив')
      expect(listedNames()[0]).toBe('Пловдив Център')
      expect(screen.getByText('Близо до Пловдив Център')).toBeInTheDocument()
      expect(map()).toHaveAttribute('data-reference', 'chosen-office')
    })

    it('sorts around the place again once the customer drops the office', async () => {
      const user = userEvent.setup()
      renderBrowser({ chosenCode: '2' })

      await user.click(
        screen.getByRole('button', { name: 'Спри подреждането по близост до Пловдив Център' }),
      )

      expect(map()).toHaveAttribute('data-reference', 'place')
      expect(listedNames()).toEqual(['Пловдив Център'])
    })
  })

  describe('near me', () => {
    it("fills in the nearest office's place and sorts by closeness to the customer", async () => {
      const user = userEvent.setup()
      locateDeviceAt(42.15, 24.74)
      renderBrowser()

      await user.click(screen.getByRole('button', { name: 'Близо до мен' }))

      expect(settlementBox()).toHaveValue('Пловдив')
      expect(regionSelect()).toHaveValue('Пловдив')
      expect(list().getByRole('button', { name: /Пловдив Център/ })).toHaveTextContent('1,4 км')
      expect(screen.getByText('Близо до вас')).toBeInTheDocument()
      expect(map()).toHaveAttribute('data-reference', 'device')
    })

    it('replaces a place picked before', async () => {
      const user = userEvent.setup()
      locateDeviceAt(42.15, 24.74)
      renderBrowser()
      await pickPlace(user, 'соф', /София/)

      await user.click(screen.getByRole('button', { name: 'Близо до мен' }))

      expect(settlementBox()).toHaveValue('Пловдив')
      expect(listedNames()).toEqual(['Пловдив Център'])
    })

    // A search frames the map on what it finds; the customer's point would pull it away.
    it('frames the map around the customer only while nothing is searched', async () => {
      const user = userEvent.setup()
      locateDeviceAt(42.69, 23.32)
      renderBrowser()
      await user.click(screen.getByRole('button', { name: 'Близо до мен' }))

      await user.type(searchBox(), 'люлин')

      expect(map()).toHaveAttribute('data-reference', '')
      expect(screen.getByText('Близо до вас')).toBeInTheDocument()
    })

    it('says why the customer could not be located and still asks for a place', async () => {
      const user = userEvent.setup()
      getCurrentPosition.mockImplementation((_, fail) => fail({ code: 1, PERMISSION_DENIED: 1 }))
      renderBrowser()

      await user.click(screen.getByRole('button', { name: 'Близо до мен' }))

      expect(screen.getByRole('alert')).toHaveTextContent('Нямаме достъп до местоположението ви.')
      expect(prompt()).toBeInTheDocument()
    })
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
  it('keeps lockers the parcel does not fit off the map', async () => {
    const user = userEvent.setup()
    renderBrowser({
      parcelCheck: {
        state: 'ready',
        parcel: { weightGrams: 90_000, unmeasuredArticles: [], isLockerEligible: false },
      },
    })
    await pickPlace(user, 'соф', /София/)

    expect(list().getByRole('button', { name: /Еконтомат Люлин/ })).toBeDisabled()
    expect(within(map()).queryByRole('button', { name: 'маркер 3' })).not.toBeInTheDocument()
    expect(within(map()).getByRole('button', { name: 'маркер 1' })).toBeInTheDocument()
  })

  it('credits the carrier for the office data', () => {
    renderBrowser()

    expect(screen.getByText('Данните за офисите се предоставят от Еконт')).toBeInTheDocument()
  })
})
