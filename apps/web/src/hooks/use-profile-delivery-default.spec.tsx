import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useAuth } from '@clerk/nextjs'
import {
  CustomerRole,
  ShippingMethod,
  type CustomerAddressDto,
  type CustomerProfileDto,
} from '@vp-parts-shop/shared'
import { getCustomerProfile } from '@/lib/api/customers'
import { useCheckoutDelivery } from './use-checkout-delivery'
import { useProfileDeliveryDefault } from './use-profile-delivery-default'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))

jest.mock('@/lib/api/customers', () => {
  const actual = jest.requireActual('@/lib/api/customers')
  const getCustomerProfile = jest.fn()

  return {
    ...actual,
    getCustomerProfile,
    customerProfileQueryOptions: {
      ...actual.customerProfileQueryOptions,
      queryFn: () => getCustomerProfile(),
    },
  }
})

const mockedGetProfile = jest.mocked(getCustomerProfile)

const ADDRESS: CustomerAddressDto = {
  id: 'address-1',
  carrier: ShippingMethod.ECONT,
  placeId: '41',
  city: 'София',
  postCode: '1303',
  street: 'ул. Опълченска',
  streetNumber: '46',
  block: '3',
}

function profileWith(defaultAddress: CustomerAddressDto | null): CustomerProfileDto {
  return {
    id: 'customer-1',
    email: 'ivan@example.bg',
    firstName: 'Иван',
    lastName: 'Петров',
    phoneNumber: '+359888123456',
    role: CustomerRole.CUSTOMER,
    createdAt: '2026-10-01T10:00:00.000Z',
    defaultAddress,
  }
}

function renderDefault() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return renderHook(() => useProfileDeliveryDefault(), { wrapper })
}

function mockSignedIn(isSignedIn: boolean) {
  jest.mocked(useAuth).mockReturnValue({ isSignedIn } as ReturnType<typeof useAuth>)
}

beforeEach(() => {
  mockedGetProfile.mockReset()
  useCheckoutDelivery.getState().reset()
  mockSignedIn(true)
})

describe('useProfileDeliveryDefault', () => {
  it("pre-selects the profile's address when nothing is chosen on this device", async () => {
    useCheckoutDelivery.getState().setMethod('courier-office')
    mockedGetProfile.mockResolvedValue(profileWith(ADDRESS))

    renderDefault()

    await waitFor(() => expect(useCheckoutDelivery.getState().address).not.toBeNull())
    expect(useCheckoutDelivery.getState()).toMatchObject({
      method: 'courier-address',
      address: {
        carrier: ShippingMethod.ECONT,
        address: {
          placeId: '41',
          street: 'ул. Опълченска',
          streetNumber: '46',
          block: '3',
        },
        label: 'ул. Опълченска 46, бл. 3, 1303 София',
      },
    })
  })

  it('keeps an address already chosen on this device', async () => {
    const chosen = {
      carrier: ShippingMethod.ECONT,
      address: { placeId: '7', street: 'бул. Витоша', streetNumber: '1' },
      label: 'бул. Витоша 1, 1000 София',
    }
    useCheckoutDelivery.getState().selectAddress(chosen)
    mockedGetProfile.mockResolvedValue(profileWith(ADDRESS))

    renderDefault()

    await waitFor(() => expect(mockedGetProfile).toHaveBeenCalled())
    expect(useCheckoutDelivery.getState().address).toEqual(chosen)
  })

  it('keeps an office already chosen on this device', async () => {
    useCheckoutDelivery.getState().setMethod('courier-office')
    useCheckoutDelivery.getState().selectOffice({ carrier: ShippingMethod.ECONT, code: '1234' })
    mockedGetProfile.mockResolvedValue(profileWith(ADDRESS))

    renderDefault()

    await waitFor(() => expect(mockedGetProfile).toHaveBeenCalled())
    expect(useCheckoutDelivery.getState()).toMatchObject({
      method: 'courier-office',
      address: null,
    })
  })

  it('leaves an address for another carrier alone', async () => {
    mockedGetProfile.mockResolvedValue(
      profileWith({ ...ADDRESS, carrier: ShippingMethod.SPEEDY }),
    )

    renderDefault()

    await waitFor(() => expect(mockedGetProfile).toHaveBeenCalled())
    expect(useCheckoutDelivery.getState().address).toBeNull()
  })

  it('does nothing for a profile without an address', async () => {
    mockedGetProfile.mockResolvedValue(profileWith(null))

    renderDefault()

    await waitFor(() => expect(mockedGetProfile).toHaveBeenCalled())
    expect(useCheckoutDelivery.getState().address).toBeNull()
  })

  it('reads no profile for a guest', () => {
    mockSignedIn(false)

    renderDefault()

    expect(mockedGetProfile).not.toHaveBeenCalled()
  })
})
