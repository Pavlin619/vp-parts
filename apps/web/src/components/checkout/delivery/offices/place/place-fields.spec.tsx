import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShippingMethod, type DeliveryPlaceDto } from '@vp-parts-shop/shared'
import { PlaceFields } from './place-fields'

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

const PLACES = [
  place({ id: '1500', name: 'Плевен' }),
  place({ id: '4000', name: 'Пловдив', region: 'Пловдив', postCode: '4000' }),
]

describe('PlaceFields', () => {
  it('offers the regions of the places it is given', () => {
    render(
      <PlaceFields
        places={PLACES}
        region={null}
        place={null}
        onRegionChange={jest.fn()}
        onPlaceChange={jest.fn()}
      />,
    )

    expect(screen.getByRole('option', { name: 'Пловдив' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Плевен' })).toBeInTheDocument()
  })

  it('reports a region and a place chosen, and a place cleared', async () => {
    const user = userEvent.setup()
    const onRegionChange = jest.fn()
    const onPlaceChange = jest.fn()
    render(
      <PlaceFields
        places={PLACES}
        region={null}
        place={null}
        onRegionChange={onRegionChange}
        onPlaceChange={onPlaceChange}
      />,
    )

    await user.selectOptions(screen.getByRole('combobox', { name: 'Област' }), 'Пловдив')
    expect(onRegionChange).toHaveBeenCalledWith('Пловдив')

    await user.type(screen.getByRole('searchbox', { name: 'Населено място' }), 'плев')
    await user.click(screen.getByRole('button', { name: /Плевен/ }))
    expect(onPlaceChange).toHaveBeenCalledWith(PLACES[0])
  })
})
