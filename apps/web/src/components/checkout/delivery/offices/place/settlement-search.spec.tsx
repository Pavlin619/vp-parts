import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShippingMethod, type DeliveryPlaceDto } from '@vp-parts-shop/shared'
import { SettlementSearch } from './settlement-search'

type SettlementSearchProps = Parameters<typeof SettlementSearch>[0]

function place(overrides: Partial<DeliveryPlaceDto>): DeliveryPlaceDto {
  return {
    carrier: ShippingMethod.ECONT,
    id: '1',
    name: 'Място',
    region: 'Плевен',
    postCode: '5800',
    servingOfficeCode: null,
    ...overrides,
  }
}

const PLEVEN = place({ id: '1500', name: 'Плевен', postCode: '5800' })
const YASEN_PLEVEN = place({ id: '27183', name: 'Ясен', postCode: '5850', servingOfficeCode: '5817' })
const YASEN_VT = place({
  id: '5080',
  name: 'Ясен',
  region: 'Велико Търново',
  postCode: '5080',
  servingOfficeCode: '5000',
})
const PLACES = [PLEVEN, YASEN_PLEVEN, YASEN_VT]

function renderSearch(overrides: Partial<SettlementSearchProps> = {}) {
  const props: SettlementSearchProps = {
    places: PLACES,
    region: null,
    place: null,
    onPick: jest.fn(),
    onClear: jest.fn(),
    ...overrides,
  }

  const view = render(<SettlementSearch {...props} />)
  return { ...view, props }
}

const settlementBox = () => screen.getByRole('searchbox', { name: 'Населено място' })

describe('SettlementSearch', () => {
  it('shows the chosen place', () => {
    renderSearch({ place: PLEVEN })

    expect(settlementBox()).toHaveValue('Плевен')
  })

  it('suggests places with their region and post code, telling same names apart', async () => {
    const user = userEvent.setup()
    renderSearch()

    await user.type(settlementBox(), 'ясен')

    const suggestions = screen.getAllByRole('button', { name: /Ясен/ })
    expect(suggestions.map((button) => button.textContent)).toEqual([
      expect.stringMatching(/Ясен.*Плевен.*5850/),
      expect.stringMatching(/Ясен.*Велико Търново.*5080/),
    ])
  })

  it('suggests only places in the chosen region', async () => {
    const user = userEvent.setup()
    renderSearch({ region: 'Плевен' })

    await user.type(settlementBox(), 'ясен')

    expect(screen.getAllByRole('button', { name: /Ясен/ })).toHaveLength(1)
  })

  it('reports the place picked and closes the suggestions', async () => {
    const user = userEvent.setup()
    const { props } = renderSearch()

    await user.type(settlementBox(), 'ясен')
    await user.click(screen.getByRole('button', { name: /Велико Търново/ }))

    expect(props.onPick).toHaveBeenCalledWith(YASEN_VT)
    expect(screen.queryByLabelText('Населени места')).not.toBeInTheDocument()
  })

  it('shows the picked place once it is chosen', async () => {
    const user = userEvent.setup()
    const { props, rerender } = renderSearch()

    await user.type(settlementBox(), 'плев')
    await user.click(screen.getByRole('button', { name: /Плевен/ }))
    rerender(<SettlementSearch {...props} place={PLEVEN} />)

    expect(settlementBox()).toHaveValue('Плевен')
  })

  it('drops the chosen place once the customer types over it', async () => {
    const user = userEvent.setup()
    const { props } = renderSearch({ place: PLEVEN })

    await user.type(settlementBox(), 'x')

    expect(props.onClear).toHaveBeenCalled()
    expect(settlementBox()).toHaveValue('Плевенx')
  })

  it('clears the chosen place with its button', async () => {
    const user = userEvent.setup()
    const { props } = renderSearch({ place: PLEVEN })

    await user.click(screen.getByRole('button', { name: 'Изчисти населеното място' }))

    expect(props.onClear).toHaveBeenCalled()
  })

  // Econt lists about a fifth of Bulgaria's villages; the rest collect in the next town.
  it('points to the nearest town when no place matches', async () => {
    const user = userEvent.setup()
    renderSearch()

    await user.type(settlementBox(), 'бов')

    expect(screen.getByText(/Изберете най-близкия град/)).toBeInTheDocument()
  })
})
