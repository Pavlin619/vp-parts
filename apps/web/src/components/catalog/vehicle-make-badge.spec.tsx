import { fireEvent, render } from '@testing-library/react'
import { VEHICLE_MAKE_LOGO_FILES } from '@/lib/catalog/display/vehicle-make-mark'
import { VehicleMakeBadge } from './vehicle-make-badge'

/**
 * The badge's path, or null where the generic glyph stands in for it. jsdom
 * resolves a root-relative source against the test origin.
 */
function badgeSrcOf(container: HTMLElement) {
  const src = container.querySelector('img')?.getAttribute('src')

  return src ? new URL(src).pathname : null
}

function hasGlyph(container: HTMLElement) {
  return container.querySelector('svg') !== null
}

describe('VehicleMakeBadge', () => {
  it.each([
    ['16', '/vehicle-makes/bmw.webp'],
    ['74', '/vehicle-makes/mercedes-benz.webp'],
  ])('renders the bundled badge for make %s', (id, src) => {
    const { container } = render(<VehicleMakeBadge manufacturerId={id} />)

    expect(badgeSrcOf(container)).toBe(src)
    expect(hasGlyph(container)).toBe(false)
  })

  // 57 of the 286 selectable makes have no badge, and at this size the
  // wordmark the selector's grid falls back to would render under 5px.
  it('falls back to the car glyph for a make with no bundled badge', () => {
    expect(VEHICLE_MAKE_LOGO_FILES['812']).toBeUndefined()

    const { container } = render(<VehicleMakeBadge manufacturerId="812" />)

    expect(badgeSrcOf(container)).toBeNull()
    expect(hasGlyph(container)).toBe(true)
  })

  // A scope arrived at through someone else's link names a vehicle this browser
  // never resolved, so there is no make to badge.
  it('falls back to the car glyph when no make is known', () => {
    const { container } = render(<VehicleMakeBadge manufacturerId={null} />)

    expect(hasGlyph(container)).toBe(true)
  })

  it('falls back to the car glyph when the badge fails to load', () => {
    const { container } = render(<VehicleMakeBadge manufacturerId="16" />)

    fireEvent.error(container.querySelector('img')!)

    expect(badgeSrcOf(container)).toBeNull()
    expect(hasGlyph(container)).toBe(true)
  })

  // The failure is remembered per file rather than as a flag, so a pill whose
  // vehicle changes is not stuck on the glyph for the rest of the session.
  it('tries again when the make changes', () => {
    const { container, rerender } = render(<VehicleMakeBadge manufacturerId="16" />)

    fireEvent.error(container.querySelector('img')!)
    rerender(<VehicleMakeBadge manufacturerId="74" />)

    expect(badgeSrcOf(container)).toBe('/vehicle-makes/mercedes-benz.webp')
  })

  // Every caller prints the make's name beside the tile.
  it('keeps the badge out of the accessibility tree', () => {
    const { container } = render(<VehicleMakeBadge manufacturerId="16" />)

    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('takes its size and corner from the caller', () => {
    const { container } = render(
      <VehicleMakeBadge manufacturerId="16" className="h-8 w-8 rounded-lg" />,
    )

    expect(container.firstElementChild).toHaveClass('h-8', 'w-8', 'rounded-lg')
  })
})
