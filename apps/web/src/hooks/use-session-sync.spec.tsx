import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAuth } from '@clerk/nextjs'
import {
  CustomerRole,
  EMPTY_CART,
  ShippingMethod,
  type CartAdoptResponseDto,
  type CartDto,
  type CustomerProfileDto,
} from '@vp-parts-shop/shared'
import { ApiError } from '@/lib/api'
import { adoptCart, clearCartToken, getCart, readCartToken } from '@/lib/api/cart'
import { fileCustomer, getCustomerProfile } from '@/lib/api/customers'
import { useAccountSetup, useAccountSetupStore } from './use-account-setup'
import { useCart, type CartLine } from './use-cart'
import { useCheckoutDelivery } from './use-checkout-delivery'
import { useSessionSync } from './use-session-sync'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))

jest.mock('@/lib/api/customers', () => {
  const getCustomerProfile = jest.fn()

  return {
    ...jest.requireActual('@/lib/api/customers'),
    getCustomerProfile,
    fileCustomer: jest.fn(),
    customerProfileQueryOptions: {
      queryKey: ['customers', 'me'],
      queryFn: () => getCustomerProfile(),
      retry: false,
    },
  }
})

jest.mock('@/lib/api/cart', () => ({
  ...jest.requireActual('@/lib/api/cart'),
  adoptCart: jest.fn(),
  clearCartToken: jest.fn(),
  getCart: jest.fn(),
  readCartToken: jest.fn(),
}))

const mockedUseAuth = useAuth as jest.Mock
const mockedGetProfile = jest.mocked(getCustomerProfile)
const mockedFileCustomer = jest.mocked(fileCustomer)
const mockedAdoptCart = jest.mocked(adoptCart)
const mockedGetCart = jest.mocked(getCart)
const mockedReadCartToken = jest.mocked(readCartToken)
const mockedClearCartToken = jest.mocked(clearCartToken)

const PROFILE: CustomerProfileDto = {
  id: 'customer-1',
  email: 'ivan@example.bg',
  firstName: 'Иван',
  lastName: 'Петров',
  phoneNumber: '+359888123456',
  role: CustomerRole.CUSTOMER,
  createdAt: '2026-10-01T10:00:00.000Z',
}

function line(articleNumber: string): CartLine {
  return {
    brandId: '268',
    articleNumber,
    brandName: 'WIX',
    brandLogoUrl: null,
    description: 'Маслен филтър',
    thumbnailUrl: null,
    quantity: 1,
    isSelected: true,
    addedAtPriceIncVat: null,
  }
}

function serverCart(id: string, ...articleNumbers: string[]): CartDto {
  return {
    id,
    version: 3,
    lines: articleNumbers.map((articleNumber) => ({
      ...line(articleNumber),
      addedAt: '2026-09-01T10:00:00.000Z',
    })),
  }
}

function signedIn(userId: string) {
  mockedUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true, userId })
}

function signedOut() {
  mockedUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false, userId: null })
}

function renderSync(queryClient = new QueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  // Reads back what the sync reported, as checkout's contact panel does.
  const useSyncAndReport = () => {
    useSessionSync()
    return useAccountSetup()
  }

  return { ...renderHook(useSyncAndReport, { wrapper }), queryClient }
}

const notFiled = () => new ApiError(404, 'CUSTOMER_PROFILE_INCOMPLETE')

const { whenSettled } = useCart.getState()

beforeEach(() => {
  jest.clearAllMocks()
  useAccountSetupStore.setState({ stall: null, attempt: 0 })
  useCart.setState({ whenSettled })
  useCart.getState().reset()
  useCheckoutDelivery.getState().reset()
  mockedGetProfile.mockResolvedValue(PROFILE)
  mockedFileCustomer.mockResolvedValue(PROFILE)
  mockedReadCartToken.mockReturnValue(null)
  mockedGetCart.mockResolvedValue(EMPTY_CART)
})

describe('useSessionSync', () => {
  it('waits for Clerk to load', async () => {
    mockedUseAuth.mockReturnValue({ isLoaded: false, isSignedIn: undefined, userId: undefined })

    renderSync()
    await Promise.resolve()

    expect(mockedGetProfile).not.toHaveBeenCalled()
  })

  describe('a signed-in customer', () => {
    beforeEach(() => signedIn('user_1'))

    it('is not filed again once they have a profile', async () => {
      const { queryClient } = renderSync()

      await waitFor(() =>
        expect(queryClient.getQueryData(['customers', 'me'])).toEqual(PROFILE),
      )
      expect(mockedFileCustomer).not.toHaveBeenCalled()
    })

    // The webhook may not have landed yet, or may never land in local dev.
    it('is filed when the API has no profile for them yet', async () => {
      mockedGetProfile.mockRejectedValue(notFiled())

      const { queryClient } = renderSync()

      await waitFor(() => expect(mockedFileCustomer).toHaveBeenCalledTimes(1))
      await waitFor(() =>
        expect(queryClient.getQueryData(['customers', 'me'])).toEqual(PROFILE),
      )
    })

    it.each(['VALIDATION_ERROR', 'EMAIL_ALREADY_EXISTS'])(
      'reports an account that cannot be filed (%s)',
      async (errorCode) => {
        mockedGetProfile.mockRejectedValue(notFiled())
        mockedFileCustomer.mockRejectedValue(new ApiError(422, errorCode))
        mockedReadCartToken.mockReturnValue('guest-token')

        const { result } = renderSync()

        await waitFor(() => expect(result.current.accountSetup).toBe('failed'))
        expect(mockedAdoptCart).not.toHaveBeenCalled()
      },
    )

    describe('who signed in through Google or Facebook with no phone', () => {
      beforeEach(() => {
        mockedGetProfile.mockRejectedValue(notFiled())
        mockedFileCustomer.mockRejectedValue(new ApiError(422, 'CUSTOMER_PHONE_REQUIRED'))
        mockedReadCartToken.mockReturnValue('guest-token')
        mockedAdoptCart.mockResolvedValue({ cart: EMPTY_CART, droppedLines: [] })
      })

      it('asks for the phone and leaves the guest cart alone', async () => {
        const { result } = renderSync()

        await waitFor(() => expect(result.current.accountSetup).toBe('phone-required'))
        expect(mockedAdoptCart).not.toHaveBeenCalled()
      })

      // The dialog filed them; the cart merge it held back runs now.
      it('carries on with the cart once resumed', async () => {
        const { result } = renderSync()
        await waitFor(() => expect(result.current.accountSetup).toBe('phone-required'))

        mockedGetProfile.mockResolvedValue(PROFILE)
        act(() => result.current.resume())

        expect(result.current.accountSetup).toBe('ok')
        await waitFor(() => expect(mockedAdoptCart).toHaveBeenCalledTimes(1))
        expect(result.current.accountSetup).toBe('ok')
      })

      it('does not ask the next account to sign in on this device', async () => {
        const { result, rerender } = renderSync()
        await waitFor(() => expect(result.current.accountSetup).toBe('phone-required'))

        mockedGetProfile.mockResolvedValue(PROFILE)
        signedIn('user_2')
        rerender()

        expect(result.current.accountSetup).toBe('ok')
      })
    })

    // A dropped connection says nothing about the account; the next load retries.
    it('does not report a transient failure, and leaves the cart alone', async () => {
      mockedGetProfile.mockRejectedValue(new ApiError(503, 'UNKNOWN_ERROR'))
      mockedReadCartToken.mockReturnValue('guest-token')

      const { result } = renderSync()

      await waitFor(() => expect(mockedGetProfile).toHaveBeenCalled())
      await Promise.resolve()
      expect(result.current.accountSetup).toBe('ok')
      expect(mockedAdoptCart).not.toHaveBeenCalled()
    })

    describe('with a guest cart on the device', () => {
      const merge: CartAdoptResponseDto = {
        cart: serverCart('account-cart', 'GUEST-1', 'ACCOUNT-1'),
        droppedLines: [],
      }

      beforeEach(() => {
        mockedReadCartToken.mockReturnValue('guest-token')
        mockedAdoptCart.mockResolvedValue(merge)
        useCart.setState({ lines: [line('GUEST-1')], cartId: 'guest-cart', version: 1 })
      })

      // The adopt needs the customer row, and must not race a write the guest
      // made a moment before signing in.
      it('files the customer, lets writes settle, then adopts', async () => {
        const order: string[] = []
        mockedGetProfile.mockImplementation(async () => {
          order.push('profile')
          return PROFILE
        })
        useCart.setState({
          whenSettled: async () => {
            order.push('settled')
          },
        })
        mockedAdoptCart.mockImplementation(async () => {
          order.push('adopt')
          return merge
        })

        renderSync()

        await waitFor(() => expect(order).toEqual(['profile', 'settled', 'adopt']))
      })

      it('takes the merged cart as the account’s and forgets the guest token', async () => {
        const { queryClient } = renderSync()

        await waitFor(() => expect(useCart.getState().cartId).toBe('account-cart'))
        expect(useCart.getState().ownerId).toBe('user_1')
        expect(useCart.getState().lines).toHaveLength(2)
        expect(mockedClearCartToken).toHaveBeenCalled()
        expect(queryClient.getQueryData(['cart'])).toEqual(merge.cart)
      })

      it('keeps what the merge had to drop for the notice', async () => {
        mockedAdoptCart.mockResolvedValue({
          ...merge,
          droppedLines: [{ brandId: '268', articleNumber: 'GUEST-1' }],
        })

        renderSync()

        await waitFor(() =>
          expect(useCart.getState().droppedLines).toEqual([
            { brandId: '268', articleNumber: 'GUEST-1', brandName: 'WIX' },
          ]),
        )
      })

      it('keeps the token for the next load when the adopt fails', async () => {
        mockedAdoptCart.mockRejectedValue(new Error('offline'))

        renderSync()

        await waitFor(() => expect(mockedAdoptCart).toHaveBeenCalled())
        await Promise.resolve()
        expect(mockedClearCartToken).not.toHaveBeenCalled()
        expect(useCart.getState().cartId).toBe('guest-cart')
      })

      // The merge happened on the server; painting it on a device that has
      // since signed out would show the account's parts to the next person.
      it('does not paint the merge when the session ended while it ran', async () => {
        let answer: (merge: CartAdoptResponseDto) => void = () => {}
        mockedAdoptCart.mockReturnValue(
          new Promise((resolve) => {
            answer = resolve
          }),
        )

        const { rerender } = renderSync()
        await waitFor(() => expect(mockedAdoptCart).toHaveBeenCalled())

        signedOut()
        rerender()
        answer(merge)
        await Promise.resolve()

        expect(useCart.getState().ownerId).toBeNull()
        expect(useCart.getState().cartId).not.toBe('account-cart')
      })
    })

    describe('with no guest cart on the device', () => {
      it('reads the account’s cart on a first sign-in here', async () => {
        mockedGetCart.mockResolvedValue(serverCart('account-cart', 'ACCOUNT-1'))

        const { queryClient } = renderSync()

        await waitFor(() => expect(useCart.getState().ownerId).toBe('user_1'))
        expect(useCart.getState().cartId).toBe('account-cart')
        expect(queryClient.getQueryData(['cart'])).toEqual(
          serverCart('account-cart', 'ACCOUNT-1'),
        )
        expect(mockedAdoptCart).not.toHaveBeenCalled()
      })

      // A reload while signed in: the mirror is already theirs, and the
      // ordinary cart read keeps it fresh.
      it('leaves a mirror that is already theirs to the cart sync', async () => {
        useCart.setState({ ownerId: 'user_1', cartId: 'account-cart' })

        renderSync()

        await waitFor(() => expect(mockedGetProfile).toHaveBeenCalled())
        await Promise.resolve()
        expect(mockedGetCart).not.toHaveBeenCalled()
        expect(mockedAdoptCart).not.toHaveBeenCalled()
      })
    })
  })

  describe('a device left holding an account’s cart', () => {
    beforeEach(() => {
      useCart.setState({
        lines: [line('ACCOUNT-1')],
        cartId: 'account-cart',
        version: 4,
        ownerId: 'user_1',
      })
      useCheckoutDelivery.getState().selectOffice({ carrier: ShippingMethod.ECONT, code: '1127' })
    })

    it('is cleared once signed out', async () => {
      signedOut()
      const queryClient = new QueryClient()
      queryClient.setQueryData(['customers', 'me'], PROFILE)

      renderSync(queryClient)

      await waitFor(() => expect(useCart.getState().lines).toEqual([]))
      expect(useCart.getState().ownerId).toBeNull()
      expect(useCheckoutDelivery.getState().office).toBeNull()
      expect(queryClient.getQueryData(['customers', 'me'])).toBeUndefined()
    })

    it('is cleared before another customer is joined', async () => {
      signedIn('user_2')
      mockedGetCart.mockResolvedValue(serverCart('other-cart', 'OTHER-1'))

      renderSync()

      await waitFor(() => expect(useCart.getState().ownerId).toBe('user_2'))
      expect(useCart.getState().lines.map((entry) => entry.articleNumber)).toEqual([
        'OTHER-1',
      ])
      expect(useCheckoutDelivery.getState().office).toBeNull()
    })
  })

  // A guest's own cart is what a sign-in will adopt; clearing it would lose it.
  it('keeps a guest’s cart while signed out', async () => {
    signedOut()
    useCart.setState({ lines: [line('GUEST-1')], cartId: 'guest-cart', ownerId: null })
    useCheckoutDelivery.getState().selectOffice({ carrier: ShippingMethod.ECONT, code: '1127' })

    renderSync()
    await Promise.resolve()

    expect(useCart.getState().lines).toHaveLength(1)
    expect(useCheckoutDelivery.getState().office).not.toBeNull()
  })
})
