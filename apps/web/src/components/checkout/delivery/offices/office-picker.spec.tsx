import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
  type ParcelEstimateDto,
} from '@vp-parts-shop/shared'
import { useCart } from '@/hooks/use-cart'
import { useCheckoutDelivery } from '@/hooks/use-checkout-delivery'
import { OfficePicker } from './office-picker'

const getOffices = jest.fn<Promise<DeliveryOfficeDto[]>, [ShippingMethod]>()
const getParcel = jest.fn<Promise<ParcelEstimateDto>, [ShippingMethod, string, number]>()

jest.mock('@/lib/api/delivery', () => ({
  deliveryOfficesQueryOptions: (carrier: ShippingMethod) => ({
    queryKey: ['delivery', 'offices', carrier],
    queryFn: () => getOffices(carrier),
  }),
  parcelEstimateQueryOptions: (carrier: ShippingMethod, cartId: string, cartVersion: number) => ({
    queryKey: ['delivery', 'parcel', carrier, cartId, cartVersion],
    queryFn: () => getParcel(carrier, cartId, cartVersion),
  }),
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
const PLOVDIV = office({ code: '2', name: 'Пловдив Център', city: 'Пловдив', address: 'Пловдив ул. Вазов 12' })
const LOCKER = office({ code: '3', name: 'Еконтомат Люлин', type: DeliveryOfficeType.LOCKER })

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
    getParcel.mockReset().mockResolvedValue(FITS_LOCKER)
  })

  it("lists the carrier's offices once they load", async () => {
    renderPicker()

    expect(screen.getByTestId('office-picker-skeleton')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /София Младост/ })).toBeInTheDocument()
    expect(screen.getByText('Еконт', { selector: 'b' })).toBeInTheDocument()
    expect(getOffices).toHaveBeenCalledWith(ShippingMethod.ECONT)
  })

  it('weighs the parcel for the cart and version on screen', async () => {
    renderPicker()

    await screen.findByRole('button', { name: /София Младост/ })
    expect(getParcel).toHaveBeenCalledWith(ShippingMethod.ECONT, 'cart-1', 4)
  })

  it('offers a retry when the offices cannot be read', async () => {
    getOffices.mockRejectedValueOnce(new Error('down'))
    const user = userEvent.setup()
    renderPicker()

    expect(
      await screen.findByText('В момента не можем да заредим офисите на куриера.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))
    expect(await screen.findByRole('button', { name: /София Младост/ })).toBeInTheDocument()
  })

  // Opening an office only shows it in full; the button there is the choice.
  it('remembers the office confirmed in the list and shows it as chosen', async () => {
    const user = userEvent.setup()
    renderPicker()
    await screen.findByRole('button', { name: /Пловдив Център/ })

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

  it("reopens the list in the chosen office's city to change it, and cancels back", async () => {
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

  it('asks again when the remembered locker no longer takes the parcel', async () => {
    useCheckoutDelivery.setState({ office: { carrier: ShippingMethod.ECONT, code: '3' } })
    getParcel.mockResolvedValue({ ...FITS_LOCKER, isLockerEligible: false })
    renderPicker()

    expect(await screen.findByRole('button', { name: /Еконтомат Люлин/ })).toBeDisabled()
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
