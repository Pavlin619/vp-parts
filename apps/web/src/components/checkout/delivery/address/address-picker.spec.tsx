import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DeliveryAddressValidationStatus,
  ShippingMethod,
  type DeliveryAddressValidationDto,
  type DeliveryPlaceDto,
} from '@vp-parts-shop/shared'
import { useCheckoutDelivery } from '@/hooks/use-checkout-delivery'
import { AddressPicker } from './address-picker'

const getPlaces = jest.fn<Promise<DeliveryPlaceDto[]>, []>()
const validate = jest.fn<Promise<DeliveryAddressValidationDto>, [unknown]>()

jest.mock('@/lib/api/delivery', () => ({
  deliveryAddressPlacesQueryOptions: (carrier: string) => ({
    queryKey: ['delivery', 'address-places', carrier],
    queryFn: () => getPlaces(),
  }),
  deliveryStreetSuggestionsQueryOptions: () => ({
    queryKey: ['streets'],
    queryFn: () => [],
    enabled: false,
  }),
  deliveryQuarterSuggestionsQueryOptions: () => ({
    queryKey: ['quarters'],
    queryFn: () => [],
    enabled: false,
  }),
  validateDeliveryAddress: (request: unknown) => validate(request),
}))

const SOFIA: DeliveryPlaceDto = {
  carrier: ShippingMethod.ECONT,
  id: '41',
  name: 'София',
  region: 'София-град',
  postCode: '1303',
  servingOfficeCode: null,
}

const SUBMIT = 'Доставяй на този адрес'

function renderPicker() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return render(<AddressPicker carrier={ShippingMethod.ECONT} />, { wrapper })
}

async function pickSofia(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByRole('searchbox', { name: 'Населено място' }), 'соф')
  await user.click(screen.getByRole('button', { name: /София/ }))
}

async function fillStreetAddress(user: ReturnType<typeof userEvent.setup>) {
  await pickSofia(user)
  await user.type(screen.getByLabelText('Улица / бул.'), 'ул. Опълченска')
  await user.type(screen.getByLabelText('Номер'), '46')
}

describe('AddressPicker', () => {
  beforeEach(() => {
    useCheckoutDelivery.setState({ method: 'courier-address', office: null, address: null })
    window.localStorage.clear()
    getPlaces.mockReset().mockResolvedValue([SOFIA])
    validate.mockReset().mockResolvedValue({
      status: DeliveryAddressValidationStatus.VALID,
      suggested: null,
    })
  })

  it('starts on the form once the places are loaded', async () => {
    renderPicker()

    expect(screen.getByTestId('address-picker-skeleton')).toBeInTheDocument()
    expect(await screen.findByRole('form', { name: 'Адрес за доставка' })).toBeInTheDocument()
  })

  it('offers a retry when the places cannot be loaded', async () => {
    getPlaces.mockRejectedValueOnce(new Error('down'))
    renderPicker()

    await userEvent.click(await screen.findByRole('button', { name: 'Опитай отново' }))

    expect(await screen.findByRole('form', { name: 'Адрес за доставка' })).toBeInTheDocument()
  })

  it('shows what is missing and focuses the first such field when confirming too early', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(await screen.findByRole('button', { name: SUBMIT }))

    expect(screen.getByText('Избери населено място от списъка')).toBeInTheDocument()
    expect(screen.getByText('Въведи улица')).toBeInTheDocument()
    expect(screen.getByText('Въведи номер')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Населено място' })).toHaveFocus()
    expect(validate).not.toHaveBeenCalled()
  })

  it('asks for the number under it once a street was left without one', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.type(await screen.findByLabelText('Улица / бул.'), 'ул. Опълченска')
    await user.tab()

    expect(screen.getByLabelText('Номер')).toHaveAccessibleDescription('Въведи номер')
  })

  it('asks for where in the quarter under the block', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(await screen.findByRole('radio', { name: 'Квартал / ж.к.' }))
    await user.type(screen.getByLabelText('Кв. / ж.к.'), 'Младост 1')
    await user.tab()

    expect(screen.getByLabelText('Блок')).toHaveAccessibleDescription(
      'Добави блок, вход, етаж или апартамент',
    )
  })

  it('sends the address keyed by place and keeps the accepted one', async () => {
    const user = userEvent.setup()
    renderPicker()

    await fillStreetAddress(user)
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    expect(validate).toHaveBeenCalledWith({
      carrier: ShippingMethod.ECONT,
      address: { placeId: '41', street: 'ул. Опълченска', streetNumber: '46' },
    })
    expect(await screen.findByText('ул. Опълченска 46, 1303 София')).toBeInTheDocument()
    expect(useCheckoutDelivery.getState().address?.address.placeId).toBe('41')
  })

  it('shows only the fields of the chosen route and clears the other', async () => {
    const user = userEvent.setup()
    renderPicker()

    await fillStreetAddress(user)
    await user.type(screen.getByLabelText('Блок'), '3')
    await user.type(screen.getByLabelText(/Забележка/), 'звънец')
    await user.click(screen.getByRole('radio', { name: 'Квартал / ж.к.' }))

    expect(screen.queryByLabelText('Улица / бул.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Кв. / ж.к.')).toBeInTheDocument()
    expect(screen.getByLabelText('Блок')).toHaveValue('')

    await user.click(screen.getByRole('radio', { name: 'Улица и номер' }))

    expect(screen.getByLabelText('Улица / бул.')).toHaveValue('')
    expect(screen.getByLabelText('Номер')).toHaveValue('')
    expect(screen.getByLabelText('Блок')).toHaveValue('')
    expect(screen.queryByLabelText('Кв. / ж.к.')).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Населено място' })).toHaveValue('София')
    expect(screen.getByLabelText(/Забележка/)).toHaveValue('звънец')
  })

  it('accepts a street with its number and an apartment', async () => {
    const user = userEvent.setup()
    renderPicker()

    await fillStreetAddress(user)
    await user.type(screen.getByLabelText('Апартамент'), '12')
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    expect(await screen.findByText('ул. Опълченска 46, ап. 12, 1303 София')).toBeInTheDocument()
  })

  it('accepts a quarter with a block instead of a street, with its note', async () => {
    const user = userEvent.setup()
    renderPicker()

    await pickSofia(user)
    await user.click(screen.getByRole('radio', { name: 'Квартал / ж.к.' }))
    await user.type(screen.getByLabelText('Кв. / ж.к.'), 'Младост 1')
    await user.type(screen.getByLabelText('Блок'), '5')
    await user.type(screen.getByLabelText(/Забележка/), 'звънецът не работи')
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    expect(await screen.findByText('Младост 1, бл. 5, 1303 София')).toBeInTheDocument()
    expect(screen.getByText('Бележка: звънецът не работи')).toBeInTheDocument()
  })

  it('offers the correction when the carrier changed the street, and takes it', async () => {
    const user = userEvent.setup()
    validate.mockResolvedValue({
      status: DeliveryAddressValidationStatus.UNCERTAIN,
      suggested: { placeId: '41', street: 'ул. Опълченска', streetNumber: '46' },
    })
    renderPicker()

    await pickSofia(user)
    await user.type(screen.getByLabelText('Улица / бул.'), 'ул. Опълченскa')
    await user.type(screen.getByLabelText('Номер'), '46')
    await user.click(screen.getByRole('button', { name: SUBMIT }))
    await user.click(await screen.findByRole('button', { name: 'Използвай предложението' }))

    expect(screen.getByText('ул. Опълченска 46, 1303 София')).toBeInTheDocument()
    expect(useCheckoutDelivery.getState().address?.address.street).toBe('ул. Опълченска')
  })

  it('keeps the typed address when the customer prefers it over the correction', async () => {
    const user = userEvent.setup()
    validate.mockResolvedValue({
      status: DeliveryAddressValidationStatus.UNCERTAIN,
      suggested: { placeId: '41', street: 'ул. Друга', streetNumber: '46' },
    })
    renderPicker()

    await fillStreetAddress(user)
    await user.click(screen.getByRole('button', { name: SUBMIT }))
    await user.click(await screen.findByRole('button', { name: 'Запази моя адрес' }))

    expect(useCheckoutDelivery.getState().address?.address.street).toBe('ул. Опълченска')
  })

  it('does not accept an address the carrier does not know', async () => {
    const user = userEvent.setup()
    validate.mockResolvedValue({ status: DeliveryAddressValidationStatus.INVALID, suggested: null })
    renderPicker()

    await fillStreetAddress(user)
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    expect(await screen.findByLabelText('Улица / бул.')).toHaveAccessibleDescription(
      'Невалиден адрес. Провери улицата, номера и населеното място.',
    )
    expect(screen.getByLabelText('Улица / бул.')).toBeInvalid()
    expect(screen.getByLabelText('Улица / бул.')).toHaveFocus()
    expect(useCheckoutDelivery.getState().address).toBeNull()

    await user.type(screen.getByLabelText('Улица / бул.'), 'а')

    expect(screen.getByLabelText('Улица / бул.')).toBeValid()
  })

  it('says so when the address could not be checked', async () => {
    const user = userEvent.setup()
    validate.mockRejectedValue(new Error('down'))
    renderPicker()

    await fillStreetAddress(user)
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не успяхме да проверим')
    expect(useCheckoutDelivery.getState().address).toBeNull()
  })

  it('lets the customer change the accepted address', async () => {
    const user = userEvent.setup()
    renderPicker()

    await fillStreetAddress(user)
    await user.click(screen.getByRole('button', { name: SUBMIT }))
    await user.click(await screen.findByRole('button', { name: 'Промени' }))

    await waitFor(() => expect(screen.getByLabelText('Улица / бул.')).toHaveValue('ул. Опълченска'))
    expect(screen.getByRole('searchbox', { name: 'Населено място' })).toHaveValue('София')
    expect(screen.getByRole('button', { name: 'Отказ' })).toBeInTheDocument()
  })

  it('shows an address remembered from an earlier visit', async () => {
    useCheckoutDelivery.setState({
      address: {
        carrier: ShippingMethod.ECONT,
        address: { placeId: '41', street: 'ул. Опълченска', streetNumber: '46' },
        label: 'ул. Опълченска 46, 1303 София',
      },
    })
    renderPicker()

    expect(await screen.findByText('ул. Опълченска 46, 1303 София')).toBeInTheDocument()
  })
})
