import { DeliveryOfficeType, ShippingMethod } from '@vp-parts-shop/shared'
import {
  carrierColorToken,
  officePinImageExpression,
  officePinImageId,
  officePinSvg,
  OFFICE_GLYPHS,
} from './office-pin'

describe('carrierColorToken', () => {
  it('draws Econt in its own blue', () => {
    expect(carrierColorToken(ShippingMethod.ECONT)).toBe('--carrier-econt')
  })

  it('draws a carrier without a colour of its own in ink', () => {
    expect(carrierColorToken(ShippingMethod.SPEEDY)).toBe('--ink')
  })
})

describe('officePinImageId', () => {
  it('names one image per carrier and office type', () => {
    expect(officePinImageId(ShippingMethod.ECONT, DeliveryOfficeType.LOCKER)).toBe(
      'office-pin-ECONT-LOCKER',
    )
    expect(officePinImageId('selected', DeliveryOfficeType.OFFICE)).toBe(
      'office-pin-selected-OFFICE',
    )
  })
})

describe('officePinImageExpression', () => {
  // Evaluates the `concat` the map runs per feature, so the two spellings cannot drift apart.
  function evaluate(expression: unknown[], feature: Record<string, string>): string {
    return expression
      .slice(1)
      .map((part) => (Array.isArray(part) ? feature[part[1] as string] : part))
      .join('')
  }

  it("names the same image as the id for a feature's own carrier", () => {
    const feature = { carrier: ShippingMethod.ECONT, type: DeliveryOfficeType.LOCKER }

    expect(evaluate(officePinImageExpression(['get', 'carrier']), feature)).toBe(
      officePinImageId(ShippingMethod.ECONT, DeliveryOfficeType.LOCKER),
    )
  })

  it('names the same image as the id for the selected pin', () => {
    const feature = { type: DeliveryOfficeType.OFFICE }

    expect(evaluate(officePinImageExpression('selected'), feature)).toBe(
      officePinImageId('selected', DeliveryOfficeType.OFFICE),
    )
  })
})

describe('officePinSvg', () => {
  it('draws the glyph of the office type on a filled, ringed disc at the given size', () => {
    const svg = officePinSvg({
      type: DeliveryOfficeType.LOCKER,
      fill: '#234182',
      ring: '#FFFFFF',
      size: 56,
    })

    expect(svg).toContain('width="56" height="56"')
    expect(svg).toContain('fill="#234182" stroke="#FFFFFF"')
    for (const path of OFFICE_GLYPHS[DeliveryOfficeType.LOCKER]) {
      expect(svg).toContain(`<path d="${path}"/>`)
    }
    expect(svg).not.toContain(OFFICE_GLYPHS[DeliveryOfficeType.OFFICE][0])
  })
})
