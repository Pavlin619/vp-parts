import { render } from '@testing-library/react'
import { DeliveryOfficeType, ShippingMethod } from '@vp-parts-shop/shared'
import { OFFICE_GLYPHS } from '@/lib/checkout/delivery/office-pin'
import { OfficePinIcon } from './office-pin-icon'

const disc = (container: HTMLElement) => container.querySelector('circle')

describe('OfficePinIcon', () => {
  it('draws the glyph of the office type', () => {
    const { container } = render(
      <OfficePinIcon carrier={ShippingMethod.ECONT} type={DeliveryOfficeType.LOCKER} />,
    )

    const paths = [...container.querySelectorAll('path')].map((path) => path.getAttribute('d'))
    expect(paths).toEqual(OFFICE_GLYPHS[DeliveryOfficeType.LOCKER])
  })

  it('fills the pin in the carrier colour', () => {
    const { container } = render(
      <OfficePinIcon carrier={ShippingMethod.ECONT} type={DeliveryOfficeType.OFFICE} />,
    )

    expect(disc(container)).toHaveAttribute('fill', 'var(--carrier-econt)')
  })

})
