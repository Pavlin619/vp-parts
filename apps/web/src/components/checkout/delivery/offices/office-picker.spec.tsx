import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
  type DeliveryPlaceDto,
  type ParcelEstimateDto,
} from '@vp-parts-shop/shared'
import { useCart } from '@/hooks/use-cart'
import { useCheckoutDelivery } from '@/hooks/use-checkout-delivery'
import { OfficePicker } from './office-picker'

const getOffices = jest.fn<Promise<DeliveryOfficeDto[]>, [ShippingMethod]>()
const getPlaces = jest.fn<Promise<DeliveryPlaceDto[]>, [ShippingMethod]>()
const getParcel = jest.fn<Promise<ParcelEstimateDto>, [ShippingMethod, string, number]>()

jest.mock('@/lib/api/delivery', () => ({
  deliveryOfficesQueryOptions: (carrier: ShippingMethod) => ({
    queryKey: ['delivery', 'offices', carrier],
    queryFn: () => getOffices(carrier),
  }),
  deliveryPlacesQueryOptions: (carrier: ShippingMethod) => ({
    queryKey: ['delivery', 'places', carrier],
    queryFn: () => getPlaces(carrier),
  }),
  parcelEstimateQueryOptions: (carrier: ShippingMethod, cartId: string, cartVersion: number) => ({
    queryKey: ['delivery', 'parcel', carrier, cartId, cartVersion],
    queryFn: () => getParcel(carrier, cartId, cartVersion),
  }),
}))

const getApproximateLocation = jest.fn()

jest.mock('@/lib/api/approximate-location', () => ({
  approximateLocationQueryOptions: {
    queryKey: ['geo', 'approximate-location'],
    queryFn: () => getApproximateLocation(),
  },
}))

jest.mock('@/lib/api/cart')

jest.mock('./map', () => ({
  OfficeMap: () => <div data-testid="office-map" />,
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
  placeId: '4000',
  city: 'Пловдив',
  address: 'Пловдив ул. Вазов 12',
  latitude: 42.14,
  longitude: 24.75,
})
const LOCKER = office({ code: '3', name: 'Еконтомат Люлин', type: DeliveryOfficeType.LOCKER })

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

const PLACES = [place({}), place({ id: '4000', name: 'Пловдив', region: 'Пловдив', postCode: '4000' })]

const FITS_LOCKER: ParcelEstimateDto = {
  weightGrams: 1200,
  unmeasuredArticles: [],
  isLockerEligible: true,
}

function renderPicker() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <OfficePicker carrier={ShippingMethod.ECONT} />
    </QueryClientProvider>,
  )
}

const settlementBox = () => screen.findByRole('searchbox', { name: 'Населено място' })

async function showOffices(user: ReturnType<typeof userEvent.setup>, query: string) {
  await user.type(screen.getByRole('searchbox', { name: 'Търсене на офис' }), query)
}

const officeButton = (name: RegExp) =>
  within(screen.getByRole('list', { name: 'Офиси' })).getByRole('button', { name })

async function chooseFromList(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(officeButton(name))
  await user.click(screen.getByRole('button', { name: 'Вземи от този офис' }))
}

describe('OfficePicker', () => {
  beforeEach(() => {
    useCheckoutDelivery.setState({ method: 'courier-office', office: null })
    useCart.setState({ cartId: 'cart-1', version: 4 })
    getOffices.mockReset().mockResolvedValue([MLADOST, PLOVDIV, LOCKER])
    getPlaces.mockReset().mockResolvedValue(PLACES)
    getApproximateLocation.mockReset().mockResolvedValue(null)
    getParcel.mockReset().mockResolvedValue(FITS_LOCKER)
  })

  it("asks for a place once the carrier's offices and places load", async () => {
    renderPicker()

    expect(screen.getByTestId('office-picker-skeleton')).toBeInTheDocument()
    expect(await settlementBox()).toBeInTheDocument()
    expect(screen.getByText('Еконт', { selector: 'b' })).toBeInTheDocument()
    expect(getOffices).toHaveBeenCalledWith(ShippingMethod.ECONT)
    expect(getPlaces).toHaveBeenCalledWith(ShippingMethod.ECONT)
  })

  it('starts in the place the request seems to come from', async () => {
    getApproximateLocation.mockResolvedValue({ latitude: 42.15, longitude: 24.74 })
    renderPicker()

    expect(await settlementBox()).toHaveValue('Пловдив')
  })

  it('weighs the parcel for the cart and version on screen', async () => {
    renderPicker()

    await settlementBox()
    expect(getParcel).toHaveBeenCalledWith(ShippingMethod.ECONT, 'cart-1', 4)
  })

  it.each([
    ['offices', () => getOffices.mockRejectedValueOnce(new Error('down'))],
    ['places', () => getPlaces.mockRejectedValueOnce(new Error('down'))],
  ])('offers a retry when the %s cannot be read', async (_list, failOnce) => {
    failOnce()
    const user = userEvent.setup()
    renderPicker()

    expect(
      await screen.findByText('В момента не можем да заредим офисите на куриера.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))
    expect(await settlementBox()).toBeInTheDocument()
  })

  // Opening an office only shows it in full; the button there is the choice.
  it('remembers the office confirmed in the list and shows it as chosen', async () => {
    const user = userEvent.setup()
    renderPicker()
    await settlementBox()
    await showOffices(user, 'пловдив')

    await user.click(officeButton(/Пловдив Център/))
    expect(useCheckoutDelivery.getState().office).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Вземи от този офис' }))

    expect(useCheckoutDelivery.getState().office).toEqual({
      carrier: ShippingMethod.ECONT,
      code: '2',
    })
    expect(screen.queryByRole('list', { name: 'Офиси' })).not.toBeInTheDocument()
    expect(screen.getByText('Пловдив Център')).toBeInTheDocument()
  })

  it("reopens the list in the chosen office's place to change it, and cancels back", async () => {
    useCheckoutDelivery.setState({ office: { carrier: ShippingMethod.ECONT, code: '1' } })
    const user = userEvent.setup()
    renderPicker()

    await user.click(await screen.findByRole('button', { name: 'Промени' }))
    expect(officeButton(/София Младост/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Отказ' }))
    expect(screen.getByRole('button', { name: 'Промени' })).toBeInTheDocument()
  })

  it('changes to another office', async () => {
    useCheckoutDelivery.setState({ office: { carrier: ShippingMethod.ECONT, code: '1' } })
    const user = userEvent.setup()
    renderPicker()

    await user.click(await screen.findByRole('button', { name: 'Промени' }))
    await waitFor(() => expect(officeButton(/Еконтомат Люлин/)).toBeEnabled())
    await chooseFromList(user, /Еконтомат Люлин/)

    expect(useCheckoutDelivery.getState().office?.code).toBe('3')
  })

  it('shows a remembered office as chosen on arrival', async () => {
    useCheckoutDelivery.setState({ office: { carrier: ShippingMethod.ECONT, code: '1' } })
    renderPicker()

    expect(await screen.findByText('София Младост')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Промени' })).toBeInTheDocument()
  })

  it("asks again, in the locker's place, when the remembered locker no longer takes the parcel", async () => {
    useCheckoutDelivery.setState({ office: { carrier: ShippingMethod.ECONT, code: '3' } })
    getParcel.mockResolvedValue({ ...FITS_LOCKER, isLockerEligible: false })
    renderPicker()

    expect(await settlementBox()).toHaveValue('София')
    expect(officeButton(/Еконтомат Люлин/)).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Промени' })).not.toBeInTheDocument()
  })

  it('warns that an unweighed parcel is priced by phone', async () => {
    getParcel.mockResolvedValue({
      weightGrams: null,
      unmeasuredArticles: [{ brandId: '30', articleNumber: '0 986 424 797' }],
      isLockerEligible: false,
    })
    renderPicker()

    expect(await screen.findByRole('status')).toHaveTextContent(/по телефона|Ще ви се обадим/)
  })
})
