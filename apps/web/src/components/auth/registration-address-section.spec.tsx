import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShippingMethod, type DeliveryPlaceDto } from '@vp-parts-shop/shared'
import { EMPTY_ADDRESS_FORM } from '@/components/checkout/delivery/address/address-form-values'
import { RegistrationAddressSection } from './registration-address-section'

jest.mock('@/hooks/use-delivery-name-suggestions', () => ({
  useDeliveryNameSuggestions: () => [],
}))

const getPlaces = jest.fn<Promise<DeliveryPlaceDto[]>, []>()

jest.mock('@/lib/api/delivery', () => ({
  deliveryAddressPlacesQueryOptions: (carrier: string) => ({
    queryKey: ['delivery', 'address-places', carrier],
    queryFn: () => getPlaces(),
  }),
}))

const SOFIA: DeliveryPlaceDto = {
  carrier: ShippingMethod.ECONT,
  id: '41',
  name: 'София',
  region: 'София-град',
  postCode: '1303',
  servingOfficeCode: null,
}

function renderSection(isOpen: boolean, onOpenChange = jest.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  render(
    <RegistrationAddressSection
      carrier={ShippingMethod.ECONT}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      values={EMPTY_ADDRESS_FORM}
      onValuesChange={jest.fn()}
      mode="street"
      onModeChange={jest.fn()}
      showAllErrors={false}
    />,
    { wrapper },
  )

  return { onOpenChange }
}

beforeEach(() => {
  getPlaces.mockReset().mockResolvedValue([SOFIA])
})

describe('RegistrationAddressSection', () => {
  it('starts closed, as an optional extra, without loading the places', async () => {
    const { onOpenChange } = renderSection(false)

    const opener = screen.getByRole('button', { name: /Добави адрес за доставка/ })
    expect(opener).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('по желание')).toBeInTheDocument()
    expect(getPlaces).not.toHaveBeenCalled()

    await userEvent.click(opener)

    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('shows a skeleton, then the address fields once the places load', async () => {
    renderSection(true)

    expect(screen.getByTestId('registration-address-skeleton')).toBeInTheDocument()
    expect(await screen.findByRole('searchbox', { name: 'Населено място' })).toBeInTheDocument()
  })

  it('offers a retry when the places cannot be loaded', async () => {
    getPlaces.mockRejectedValueOnce(new Error('down'))
    renderSection(true)

    await userEvent.click(await screen.findByRole('button', { name: 'Опитай отново' }))

    expect(await screen.findByRole('searchbox', { name: 'Населено място' })).toBeInTheDocument()
  })

  it('closes again without an address', async () => {
    const { onOpenChange } = renderSection(true)

    await userEvent.click(screen.getByRole('button', { name: 'Без адрес' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
