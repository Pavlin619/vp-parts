import { render, screen } from '@testing-library/react'
import { ShippingMethod } from '@vp-parts-shop/shared'
import { CarrierMark } from './carrier-mark'

describe('CarrierMark', () => {
  it.each([
    [ShippingMethod.ECONT, 'E', 'bg-[#1F4FBF]'],
    [ShippingMethod.SPEEDY, 'S', 'bg-[#C3241C]'],
  ])('marks %s with its initial on its own colour', (carrier, initial, colour) => {
    render(<CarrierMark carrier={carrier} />)

    const mark = screen.getByTestId('carrier-mark')
    expect(mark).toHaveTextContent(initial)
    expect(mark).toHaveClass(colour)
  })
})
