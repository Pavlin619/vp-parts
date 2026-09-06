import { fireEvent, render, screen } from '@testing-library/react'
import { MakeMark } from './make-mark'
import { VEHICLE_MAKE_LOGO_FILES } from '@/lib/catalog/vehicle-make-mark'

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src, onError }: { alt: string; src: string; onError: () => void }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} onError={onError} data-testid="make-logo" />
  ),
}))

function renderMark(id: string, name: string) {
  return render(<MakeMark make={{ id, name }} sizes="160px" />)
}

describe('MakeMark', () => {
  it.each([
    ['74', 'MERCEDES-BENZ', '/vehicle-makes/mercedes-benz.webp'],
    ['16', 'BMW', '/vehicle-makes/bmw.webp'],
  ])('renders the bundled badge for %s', (id, name, src) => {
    renderMark(id, name)

    expect(screen.getByTestId('make-logo')).toHaveAttribute('src', src)
    // Both callers print the name beside the mark, so it must not repeat it.
    expect(screen.getByTestId('make-logo')).toHaveAttribute('alt', '')
    expect(screen.queryByTestId('make-wordmark')).not.toBeInTheDocument()
  })

  // Glas is the largest make no badge source resolves safely, at 27 vehicles,
  // so the fallback is a live state rather than an edge case. 57 of the 286
  // selectable makes render this way.
  it('falls back to a wordmark for a make with no bundled badge', () => {
    expect(VEHICLE_MAKE_LOGO_FILES['812']).toBeUndefined()

    renderMark('812', 'GLAS')

    expect(screen.queryByTestId('make-logo')).not.toBeInTheDocument()
    expect(screen.getByTestId('make-wordmark')).toHaveTextContent('GLAS')
  })

  // A file that has gone missing must cost the wordmark rather than the
  // browser's broken-image icon.
  it('falls back to the wordmark when the badge fails to load', () => {
    renderMark('16', 'BMW')

    fireEvent.error(screen.getByTestId('make-logo'))

    expect(screen.queryByTestId('make-logo')).not.toBeInTheDocument()
    expect(screen.getByTestId('make-wordmark')).toHaveTextContent('BMW')
  })

  // The name is printed beside the mark by both callers, so a mark inside the
  // accessibility tree would have every fallback card read its name twice.
  it('keeps the mark out of the accessibility tree', () => {
    renderMark('812', 'GLAS')

    expect(screen.getByTestId('make-wordmark')).toHaveAttribute('aria-hidden', 'true')
  })

  // A multi-word name sets one word per line, and the line count feeds the
  // size. A short name stays whole even when it has a break in it: ICH-X gains
  // no size from splitting and would read as a stack of stubs.
  it.each([
    ['GLAS', ['GLAS']],
    ['KG MOBILITY', ['KG', 'MOBILITY']],
    ['STANDARD AUTOMOBILE', ['STANDARD', 'AUTOMOBILE']],
    ['AUSTIN-HEALEY', ['AUSTIN', 'HEALEY']],
    ['ICH-X', ['ICH-X']],
    ['B-ON', ['B-ON']],
  ])('sets %s one word per line', (name, lines) => {
    expect(VEHICLE_MAKE_LOGO_FILES['999000']).toBeUndefined()

    renderMark('999000', name)

    const wordmark = screen.getByTestId('make-wordmark')

    expect([...wordmark.querySelectorAll('span')].map((line) => line.textContent)).toEqual(lines)
  })

  // The type is sized in container-query units so one grid renders it at 2, 3 or
  // 4 columns and the preview frame wider still. Without a container the units
  // resolve against the viewport and the mark is a different size on every
  // surface.
  it('sizes the wordmark against its own box rather than the viewport', () => {
    const { container } = renderMark('812', 'GLAS')

    expect(container.firstElementChild).toHaveClass('[container-type:inline-size]')
    expect(screen.getByTestId('make-wordmark')).toHaveStyle({ fontSize: '24cqw' })
  })
})
