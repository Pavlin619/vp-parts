import { EMPTY_QUICK_ORDER_CONTACT } from '@/lib/checkout/contact/quick-order-contact'
import { useQuickOrder } from './use-quick-order'

const { getState, setState } = useQuickOrder

beforeEach(() => setState({ botCheck: { solve: null, hasFailed: false } }))

describe('useQuickOrder', () => {
  beforeEach(() => getState().reset())

  it('starts with an empty contact and no bot check loaded', () => {
    expect(getState().contact).toEqual(EMPTY_QUICK_ORDER_CONTACT)
    expect(getState().botCheck).toEqual({ solve: null, hasFailed: false })
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

  it('holds the widget’s solver while it is loaded', () => {
    const solve = jest.fn()

    getState().setBotCheckSolver(solve)
    expect(getState().botCheck.solve).toBe(solve)

    getState().setBotCheckSolver(null)
    expect(getState().botCheck.solve).toBeNull()
  })

  it('says the bot check failed until a later one passes', () => {
    getState().failBotCheck()
    expect(getState().botCheck.hasFailed).toBe(true)

    getState().passBotCheck()
    expect(getState().botCheck.hasFailed).toBe(false)
  })

  it('forgets the contact once the order is placed, keeping the widget loaded', () => {
    const solve = jest.fn()
    getState().setBotCheckSolver(solve)
    getState().setContactField('firstName', 'Мария')
    getState().failBotCheck()

    getState().reset()

    expect(getState().contact).toEqual(EMPTY_QUICK_ORDER_CONTACT)
    expect(getState().botCheck).toEqual({ solve, hasFailed: false })
  })
})
