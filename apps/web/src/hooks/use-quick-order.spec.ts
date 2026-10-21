import { EMPTY_QUICK_ORDER_CONTACT } from '@/lib/checkout/contact/quick-order-contact'
import { useQuickOrder } from './use-quick-order'

const { getState } = useQuickOrder

beforeEach(() => getState().reset())

describe('useQuickOrder', () => {
  it('starts with an empty contact and no bot check token', () => {
    expect(getState().contact).toEqual(EMPTY_QUICK_ORDER_CONTACT)
    expect(getState().botCheck).toEqual({ token: null, round: 0, hasFailed: false })
  })

  it('records each contact field as it is typed', () => {
    getState().setContactField('firstName', 'Мария')
    getState().setContactField('phoneNumber', '0888')

    expect(getState().contact).toEqual({
      ...EMPTY_QUICK_ORDER_CONTACT,
      firstName: 'Мария',
      phoneNumber: '0888',
    })
  })

  it('holds the token the widget hands it, clearing an earlier failure', () => {
    getState().failBotCheck()

    getState().solveBotCheck('token-1')

    expect(getState().botCheck).toMatchObject({ token: 'token-1', hasFailed: false })
  })

  it('drops an expired token', () => {
    getState().solveBotCheck('token-1')

    getState().expireBotCheck()

    expect(getState().botCheck.token).toBeNull()
  })

  it('drops the token and says so when the widget fails', () => {
    getState().solveBotCheck('token-1')

    getState().failBotCheck()

    expect(getState().botCheck).toMatchObject({ token: null, hasFailed: true })
  })

  it('starts a new round once a token is spent, keeping the contact', () => {
    getState().setContactField('firstName', 'Мария')
    getState().solveBotCheck('token-1')

    getState().spendBotCheck()

    expect(getState().botCheck).toEqual({ token: null, round: 1, hasFailed: false })
    expect(getState().contact.firstName).toBe('Мария')
  })
})
