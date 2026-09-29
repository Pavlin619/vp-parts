import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DeliveryOfficeType,
  ShippingMethod,
  type DeliveryOfficeDto,
} from '@vp-parts-shop/shared'
import { OfficeSearch } from './office-search'

const MLADOST: DeliveryOfficeDto = {
  carrier: ShippingMethod.ECONT,
  code: '1127',
  name: 'София Младост',
  placeId: '41',
  city: 'София',
  postCode: null,
  address: 'бул. Александър Малинов 51',
  latitude: 42.65,
  longitude: 23.37,
  type: DeliveryOfficeType.OFFICE,
  weekdayHours: null,
  saturdayHours: null,
}

const SUGGESTIONS = [MLADOST]
const NO_SUGGESTIONS: DeliveryOfficeDto[] = []

function renderSearch(overrides: Partial<Parameters<typeof OfficeSearch>[0]> = {}) {
  const props = {
    query: 'соф',
    onQueryChange: jest.fn(),
    suggestions: SUGGESTIONS,
    onPickOffice: jest.fn(),
    ...overrides,
  }

  render(<OfficeSearch {...props} />)
  return props
}

const searchBox = () => screen.getByRole('searchbox', { name: 'Търсене на офис' })
const suggestionList = () => screen.queryByLabelText('Предложения')

describe('OfficeSearch', () => {
  it('points the search box at the suggestions it opens', async () => {
    const user = userEvent.setup()
    renderSearch()

    await user.click(searchBox())

    const listId = searchBox().getAttribute('aria-controls')
    expect(listId).toBeTruthy()
    expect(screen.getByLabelText('Предложения')).toHaveAttribute('id', listId)
  })

  it('reports what the customer types', async () => {
    const user = userEvent.setup()
    const { onQueryChange } = renderSearch({ query: '' })

    await user.type(searchBox(), 'В')

    expect(onQueryChange).toHaveBeenCalledWith('В')
  })

  it('keeps the suggestions closed until the customer is in the box', () => {
    renderSearch()

    expect(suggestionList()).not.toBeInTheDocument()
  })

  it('offers matching offices with their city', async () => {
    const user = userEvent.setup()
    renderSearch()

    await user.click(searchBox())

    expect(screen.getByRole('button', { name: /София Младост/ })).toHaveTextContent('София')
  })

  it('reports a picked office and closes the suggestions', async () => {
    const user = userEvent.setup()
    const { onPickOffice } = renderSearch()

    await user.click(searchBox())
    await user.click(screen.getByRole('button', { name: /София Младост/ }))

    expect(onPickOffice).toHaveBeenCalledWith(MLADOST)
    expect(suggestionList()).not.toBeInTheDocument()
  })

  // Safari never focuses a clicked button, so only a box that keeps focus survives the click.
  it('keeps focus in the search box while a suggestion is pressed', async () => {
    const user = userEvent.setup()
    renderSearch()

    await user.click(searchBox())
    const isDefaultKept = fireEvent.mouseDown(screen.getByRole('button', { name: /София Младост/ }))

    expect(isDefaultKept).toBe(false)
    expect(searchBox()).toHaveFocus()
  })

  it('closes the suggestions on Escape', async () => {
    const user = userEvent.setup()
    renderSearch()

    await user.click(searchBox())
    await user.keyboard('{Escape}')

    expect(suggestionList()).not.toBeInTheDocument()
  })

  it('shows nothing when nothing matches', async () => {
    const user = userEvent.setup()
    renderSearch({ suggestions: NO_SUGGESTIONS })

    await user.click(searchBox())

    expect(suggestionList()).not.toBeInTheDocument()
  })
})
